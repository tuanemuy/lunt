import {
  Application,
  type ApplicationOf,
  ApplicationTarget,
  SubmissionScope,
} from "@repo/core/domain/application/application";
import type { StewardshipTarget } from "@repo/core/domain/application/kinds/stewardship";
import { StewardshipClaim } from "@repo/core/domain/application/stewardshipClaim";
import type { Actor } from "@repo/core/domain/common/actor";
import { ApplicationId, type PlaceId } from "@repo/core/domain/common/ids";
import { NotFoundError } from "../errors";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import { applicationIdConflict } from "./applicant";
import { defer, peek } from "./deferredInput";
import {
  readPremiseFacts,
  readSubmissionFindings,
  referenceViewability,
} from "./facts";

/**
 * What a claim is about: a place, or — to reapply for a claim filed with a
 * registration — that registration (its reserved place).
 */
export type ClaimSubject =
  | Readonly<{ placeId: PlaceId }>
  | Readonly<{ registrationId: ApplicationId }>;

export type SubmitStewardshipClaimInput = Readonly<{
  /** Minted by the caller and resent unchanged. */
  applicationId: GeneratedId;
  target: ClaimSubject;
  /** 店舗との関係. */
  relationship: string;
  /** 確認に使える連絡先または資料, as text. */
  evidence: string;
}>;

export const REGISTRATION_NOT_FOUND = "REGISTRATION_NOT_FOUND";

const registrationNotFound = (): NotFoundError =>
  new NotFoundError(
    REGISTRATION_NOT_FOUND,
    "No registration of the actor's to refer to",
  );

/**
 * The claim's target (`ApplicationTarget.byIndividual`, or
 * `ApplicationTarget.companion` of the registration it refers to).
 * `NotFoundError` when that registration is missing, not a registration,
 * or someone else's.
 */
export async function claimTarget(
  ctx: Pick<UnitOfWorkContext, "applicationRepository">,
  actor: Actor,
  subject: ClaimSubject,
): Promise<StewardshipTarget> {
  if ("placeId" in subject) {
    return ApplicationTarget.byIndividual(actor.accountId, {
      kind: "stewardship",
      placeId: subject.placeId,
    });
  }
  const found = await ctx.applicationRepository.findById(
    subject.registrationId,
  );
  if (found === null || found.entity.target.kind !== "registration") {
    throw registrationNotFound();
  }
  const target = ApplicationTarget.companion(
    found.entity as ApplicationOf<"registration">,
    actor.accountId,
  );
  if (target === null) throw registrationNotFound();
  return target;
}

/**
 * The place a claim names, read before the unit of work so its
 * viewability can be asked of `ReferenceQueries` outside it: the input's
 * place, or the reserved place of the registration it refers to (`null`
 * without such a registration — the unit of work then refuses it).
 */
export async function claimedPlace(
  container: ActorServiceArgs<unknown>["container"],
  subject: ClaimSubject,
): Promise<PlaceId | null> {
  if ("placeId" in subject) return subject.placeId;
  const found = await container.unitOfWorkProvider.run(
    ({ applicationRepository }) =>
      applicationRepository.findById(subject.registrationId),
  );
  return found !== null && found.entity.target.kind === "registration"
    ? (found.entity as ApplicationOf<"registration">).reservedPlaceId
    : null;
}

/**
 * A user claims to steward a place — with or without stewards, a place
 * registered by proxy included (SHP-04, APP-04; `spec/usecases/application.md`
 * 「submitStewardshipClaim」). No files. Referring to a registration
 * reapplies for the claim filed with it: while it is not approved, the new
 * claim refers to it too (its premise adds `registrationStanding`, and no
 * target must be viewable); after its approval it is an ordinary claim on
 * the reserved place, which must be viewable. Emits `application.submitted`
 * (operator seat).
 *
 * Checks, in order (`spec/usecases/application.md` l.67): the same id,
 * the premises, the viewable targets, an active duplicate, the content
 * (the entered values are built before the unit of work, their errors
 * held back until here), the photos. An entered input that does not make
 * valid values never equals a stored application: `ConflictError`.
 *
 * Idempotent create: the same target (the registration not compared, so a
 * resend after the registration's approval still matches) and claim
 * return the stored application; other content is `ConflictError`.
 *
 * - `NotFoundError` for a referred registration that is missing, not a
 *   registration or someone else's.
 * - `BusinessRuleError`: `APPLICATION_INVALID_STEWARDSHIP_CLAIM`,
 *   `APPLICATION_ALREADY_STEWARD`, `APPLICATION_REGISTRATION_NOT_STANDING`,
 *   `APPLICATION_TARGET_NOT_VIEWABLE`, `APPLICATION_ALREADY_ACTIVE`.
 * - `ConflictError`: the id conflict, a slot taken concurrently.
 */
export async function submitStewardshipClaim({
  container,
  actor,
  input,
}: ActorServiceArgs<SubmitStewardshipClaimInput>): Promise<
  ApplicationOf<"stewardship">
> {
  const id = ApplicationId.create(input.applicationId);
  const claim = defer(() => StewardshipClaim.create(input));
  const placeId = await claimedPlace(container, input.target);
  const viewability =
    placeId === null
      ? new Map<string, boolean>()
      : await referenceViewability(container, [{ kind: "place", id: placeId }]);
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    const target = await claimTarget(ctx, actor, input.target);
    const found = await ctx.applicationRepository.findById(id);
    if (found !== null) {
      const content = peek(claim);
      if (
        content === null ||
        !Application.matchesSubmission(found.entity, { target, content })
      ) {
        throw applicationIdConflict(id);
      }
      return found.entity as ApplicationOf<"stewardship">;
    }
    const admission = SubmissionScope.admit(
      target,
      await readSubmissionFindings(
        ctx,
        target,
        await readPremiseFacts(ctx, target),
        viewability,
      ),
    );
    const submitted = Application.submit(
      { id, admission, reserved: {}, content: claim() },
      now,
    );
    await ctx.applicationRepository.insert(submitted.entity);
    ctx.collectEvents(submitted.eventDrafts);
    return submitted.entity;
  });
}
