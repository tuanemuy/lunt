import {
  type Application,
  type ApplicationKind,
  applicationModel,
  type UnderReviewApplication,
} from "@repo/core/domain/application/application";
import type {
  ReviewAsFor,
  ReviewPermission,
  SpecOfApp,
} from "@repo/core/domain/application/kind";
import type { ApplicationKindMap } from "@repo/core/domain/application/kinds";
import { eraseKinds } from "@repo/core/domain/application/model";
import type { ReviewPolicy } from "@repo/core/domain/application/reviewPolicy";
import {
  ApplicationStatus,
  type ApplicationStatusKind,
  type ReviewAs,
  type UnderReview,
} from "@repo/core/domain/application/status";
import {
  type AccessDecision,
  AccessPolicy,
} from "@repo/core/domain/authority/accessPolicy";
import type { Actor } from "@repo/core/domain/common/actor";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import type { Version } from "@repo/core/domain/common/version";
import {
  authorizeOnTarget,
  authorizeRole,
  readTargetAccess,
} from "../authority/access";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import { APPLICATION_VERSION_CONFLICT } from "./applicant";
import type { ApplicationStatusView } from "./views";

export const APPLICATION_NOT_FOUND = "APPLICATION_NOT_FOUND";

type ReviewContext = Pick<
  UnitOfWorkContext,
  | "applicationRepository"
  | "roleRosterRepository"
  | "stewardshipRepository"
  | "accessGuard"
>;

/**
 * The kind-erased model: the reviewer's decision is kind-agnostic, and the
 * facts are built from the seat the application reports at run time.
 */
const erased = eraseKinds(applicationModel);

/** The application with its version token; `NotFoundError` when there is none. */
export async function requireApplication(
  ctx: Pick<UnitOfWorkContext, "applicationRepository">,
  id: ApplicationId,
): Promise<Versioned<Application>> {
  const found = await ctx.applicationRepository.findById(id);
  if (found === null) throw applicationNotFound(id);
  return found;
}

export const applicationNotFound = (id: ApplicationId): NotFoundError =>
  new NotFoundError(APPLICATION_NOT_FOUND, `Application ${id} does not exist`);

/** A permission that lets the actor open the application (never `notApprover`). */
export type OpenReviewPermission = Exclude<
  ReviewPermission,
  Readonly<{ reason: "notApprover" }>
>;

const NOT_APPROVER = (): ForbiddenError =>
  new ForbiddenError("FORBIDDEN", "The actor is not an approver of it");

/** The companion registration's status for a claim's approver facts. */
async function registrationStatus(
  ctx: Pick<UnitOfWorkContext, "applicationRepository">,
  app: Application,
): Promise<ApplicationStatusKind | null> {
  const id = applicationModel.Application.registrationOf(app);
  if (id === null) return null;
  const found = await ctx.applicationRepository.findById(id);
  return found?.entity.status.kind ?? null;
}

/**
 * Who may review `app` and how (`ApproverPolicy.decide` over the facts of
 * its seat, `spec/usecases/application.md` 「判断のユースケースに共通すること」).
 * `ForbiddenError` on `notApprover`. The access facts the permission rests
 * on are recorded through `authorizeRole` / `authorizeOnTarget` (D-17), so
 * a role revoked, or a seat's stewardship changed, before the unit of
 * work commits refuses it.
 */
export async function reviewPermission(
  ctx: ReviewContext,
  actor: Actor,
  app: Application,
  policy: ReviewPolicy,
  now: Date,
): Promise<OpenReviewPermission> {
  const seat = applicationModel.Application.approverSeat(app);
  if (seat.kind === "operator") {
    const authority = await authorizeRole(ctx, actor, "operate_service");
    return open(
      erased.ApproverPolicy.decide(
        app,
        {
          seat: "operator",
          serviceOperation: AccessPolicy.decide(authority, {
            kind: "operate_service",
          }),
          registration: await registrationStatus(ctx, app),
        },
        policy,
        now,
      ),
    );
  }
  const access = await readTargetAccess(ctx, actor, seat.target);
  const targetManagement: AccessDecision = AccessPolicy.decide(
    access.authority,
    { kind: "manage_target", standing: access.standing },
  );
  const permission = open(
    erased.ApproverPolicy.decide(
      app,
      {
        seat: "steward",
        targetManagement,
        serviceOperation: AccessPolicy.decide(access.authority, {
          kind: "operate_service",
        }),
      },
      policy,
      now,
    ),
  );
  if (targetManagement.allowed) {
    await authorizeOnTarget(ctx, actor, "manage_target", seat.target);
  } else {
    await authorizeRole(ctx, actor, "operate_service");
  }
  return permission;
}

function open(permission: ReviewPermission): OpenReviewPermission {
  if (!permission.allowed && permission.reason === "notApprover") {
    throw NOT_APPROVER();
  }
  return permission as OpenReviewPermission;
}

/** 編集の競合: the version the reviewer read must still be the stored one. */
function assertReviewedVersion(app: Application, reviewed: Version): void {
  if (app.version !== reviewed) {
    throw new ConflictError(
      APPLICATION_VERSION_CONFLICT,
      `Application ${app.id} changed since version ${reviewed} was read`,
    );
  }
}

/**
 * The checks after the permission, in the spec's order: the status
 * (`Application.requireUnderReview`), `awaitingStewards` /
 * `registrationPending` (`ApproverPolicy.reviewAs`), then the version
 * the reviewer read. Returns the stance an approval or rejection takes.
 */
export function requireDecision<A extends Application>(
  app: A,
  permission: OpenReviewPermission,
  reviewed: Version,
): Readonly<{ app: UnderReview<A>; as: DecisionStance<A> }> {
  const underReview = ApplicationStatus.requireUnderReview(app);
  // `decide` gives an operator-seat kind only `"approver"`, so the erased
  // stance is the kind's own `ReviewAsOf<K>`.
  const as = erased.ApproverPolicy.reviewAs(
    underReview,
    permission,
  ) as DecisionStance<A>;
  assertReviewedVersion(underReview, reviewed);
  return { app: underReview, as };
}

/** `ReviewAsOf<K>` of an application: `"approver"` for an operator-seat kind. */
export type DecisionStance<A extends Application> = ReviewAsFor<
  SpecOfApp<ApplicationKindMap, A>
> &
  ReviewAs;

/** `requireDecision` for a return (`ApproverPolicy.returnAs`). */
export function requireReturn(
  app: Application,
  permission: OpenReviewPermission,
  reviewed: Version,
): UnderReviewApplication {
  const underReview = ApplicationStatus.requireUnderReview(app);
  erased.ApproverPolicy.returnAs(underReview, permission);
  assertReviewedVersion(underReview, reviewed);
  return underReview;
}

/** An application as a review left it: its new status and version. */
export type ReviewedApplication = Readonly<{
  id: ApplicationId;
  kind: ApplicationKind;
  status: ApplicationStatusView;
  version: Version;
}>;

export const reviewed = (app: Application): ReviewedApplication => ({
  id: app.id,
  kind: app.target.kind,
  status: app.status,
  version: app.version,
});
