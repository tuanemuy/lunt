import {
  Application,
  type ApplicationOf,
  ApplicationTarget,
  type SubmissionRequest,
  SubmissionScope,
} from "@repo/core/domain/application/application";
import type { AffiliationTarget } from "@repo/core/domain/application/kinds/affiliation";
import type { LeaveTarget } from "@repo/core/domain/application/kinds/leave";
import type { Actor } from "@repo/core/domain/common/actor";
import {
  ApplicationId,
  type PlaceId,
  type RegionId,
} from "@repo/core/domain/common/ids";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import { actingFor, applicationIdConflict } from "./applicant";
import {
  readPremiseFacts,
  readSubmissionFindings,
  referenceViewability,
} from "./facts";

/**
 * Who files an application about a place (申請者の立場): the actor as an
 * individual, or the actor as the place's steward — the place itself is
 * then the applicant.
 */
export type ActingAs = "individual" | "steward";

export type MembershipKind = "affiliation" | "leave";

export type SubmitAffiliationChangeInput = Readonly<{
  /** Minted by the caller and resent unchanged. */
  applicationId: GeneratedId;
  /** 所属 or 離脱. */
  kind: MembershipKind;
  actingAs: ActingAs;
  placeId: PlaceId;
  regionId: RegionId;
}>;

/** An affiliation or a leave application. */
export type MembershipApplication =
  | ApplicationOf<"affiliation">
  | ApplicationOf<"leave">;

type MembershipTargetOf = AffiliationTarget | LeaveTarget;

/**
 * The target an affiliation or leave of `placeId` and `regionId` is filed
 * under: `ApplicationTarget.byPlace` for a steward, `byIndividual`
 * otherwise. Built from input alone; whether the actor may act for the
 * place is judged separately (`actingFor`).
 */
export function membershipTarget(
  actor: Actor,
  input: Readonly<{
    kind: MembershipKind;
    actingAs: ActingAs;
    placeId: PlaceId;
    regionId: RegionId;
  }>,
): MembershipTargetOf {
  const { kind, placeId, regionId } = input;
  return input.actingAs === "steward"
    ? ApplicationTarget.byPlace(placeId, { kind, regionId })
    : ApplicationTarget.byIndividual(actor.accountId, {
        kind,
        placeId,
        regionId,
      });
}

/** The resend an affiliation or leave compares by: its target alone. */
const requestOf = (target: MembershipTargetOf): SubmissionRequest =>
  target.kind === "affiliation" ? { target } : { target };

/**
 * Applies for a place's affiliation with a region, or its leave (REG-01〜
 * REG-03, APP-04; `spec/usecases/application.md`
 * 「submitAffiliationChange」): a steward files it as the place (`act_as_place`,
 * recorded as a commit condition — D-17 — so a stewardship lost before
 * the commit refuses it), anyone files it as an individual for a place
 * without a steward. Each region is its own application; nothing changes
 * until it is approved. Emits `application.submitted` to the region's
 * seat.
 *
 * Viewable targets (`SubmissionScope`): an individual needs the place and
 * the region viewable; a steward's affiliation needs the region; a
 * steward's leave needs nothing (an unpublished or suspended region can be
 * left). They are asked of `ReferenceQueries` before the unit of work.
 *
 * Checks, in order: the applicant (`ForbiddenError`), the same id (a
 * resend of the same target returns the stored application whatever
 * became of it; another target is `ConflictError`), the premises, the
 * viewable targets, an active application in the same slot.
 *
 * - `ForbiddenError`: `act_as_place` refused.
 * - `BusinessRuleError`: `APPLICATION_PLACE_HAS_STEWARD`,
 *   `APPLICATION_PLACE_HAS_NO_STEWARD`, `APPLICATION_ALREADY_AFFILIATED`,
 *   `APPLICATION_NOT_AFFILIATED`, `APPLICATION_TARGET_NOT_VIEWABLE`,
 *   `APPLICATION_ALREADY_ACTIVE`.
 * - `ConflictError`: the id conflict, a slot taken concurrently.
 */
export async function submitAffiliationChange({
  container,
  actor,
  input,
}: ActorServiceArgs<SubmitAffiliationChangeInput>): Promise<MembershipApplication> {
  const id = ApplicationId.create(input.applicationId);
  const target = membershipTarget(actor, input);
  const viewability = await referenceViewability(
    container,
    SubmissionScope.targets(target),
  );
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await actingFor(ctx, actor, target.applicant);
    const found = await ctx.applicationRepository.findById(id);
    if (found !== null) {
      if (!Application.matchesSubmission(found.entity, requestOf(target))) {
        throw applicationIdConflict(id);
      }
      return found.entity as MembershipApplication;
    }
    const admission = SubmissionScope.admit(
      target,
      await readSubmissionFindings(
        ctx,
        target,
        await readPremiseFacts(ctx, target, now),
        viewability,
      ),
    );
    const submitted = Application.submit(
      { id, admission, reserved: {}, content: null },
      now,
    );
    await ctx.applicationRepository.insert(submitted.entity);
    ctx.collectEvents(submitted.eventDrafts);
    return submitted.entity;
  });
}
