import {
  type ApplicationTarget,
  type IndividualTargetInput,
  SubmissionScope,
  ApplicationTarget as Targets,
} from "@repo/core/domain/application/application";
import type { PremiseKey } from "@repo/core/domain/application/premise";
import type { SubmissionTarget } from "@repo/core/domain/application/subject";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { ActorServiceArgs } from "../types";
import {
  listingViewability,
  readListingFacts,
  readPlaceHasSteward,
  readPremiseFacts,
  readSubmissionFindings,
  referencedTargets,
  referenceViewability,
  type Viewability,
  viewabilityOf,
} from "./facts";
import {
  type ClaimSubject,
  claimedPlace,
  claimTarget,
} from "./submitStewardshipClaim";

/**
 * The target to check, as its submission would build it: an individual's
 * target, or a stewardship claim referring to a registration (a
 * reapplication for the claim filed with it). S3B adds a steward's
 * targets (as a place).
 */
export type EligibilityTargetInput = IndividualTargetInput | ReferringClaim;

/** A stewardship claim referring to a registration. */
export type ReferringClaim = Readonly<{
  kind: "stewardship";
  registrationId: ApplicationId;
}>;

export type CheckSubmissionEligibilityInput = Readonly<{
  target: EligibilityTargetInput;
}>;

/**
 * Whether a submission of `target` would be accepted now
 * (`SubmissionScope.accepts`), and every reason it would not.
 */
export type SubmissionEligibility = Readonly<{
  /** The target a submission would build. */
  target: ApplicationTarget;
  accepted: boolean;
  /** The premises that do not hold, in the premise table's order. */
  brokenPremises: readonly PremiseKey[];
  /** Targets that must be viewable and are not. */
  unviewable: readonly SubmissionTarget[];
  /** The active application of the same applicant, kind and target. */
  activeDuplicate: ApplicationId | null;
  /**
   * For a stewardship claim, whether its place has a steward (the claim is
   * accepted either way; AC-56); `null` for other kinds.
   */
  placeHasSteward: boolean | null;
}>;

const claimSubject = (
  input: Extract<EligibilityTargetInput, { placeId: unknown }> | ReferringClaim,
): ClaimSubject =>
  "registrationId" in input
    ? { registrationId: input.registrationId }
    : { placeId: input.placeId };

/**
 * Before an application is entered — also before a reapplication
 * (`prepareReapplication`) and for each candidate of a target choice
 * (CF-02) — whether its submission would be accepted (SHP-04, SHP-08,
 * LST-12, LST-13, APP-04; `spec/usecases/application.md`
 * 「checkSubmissionEligibility」). The same findings as the submission,
 * returned instead of thrown; nothing is written. A registration is
 * always accepted. The listing a revision names, and its place, are read
 * as aggregates; other targets are asked of `ReferenceQueries`.
 *
 * - `NotFoundError` when the referred registration is missing, not a
 *   registration or someone else's.
 */
export async function checkSubmissionEligibility({
  container,
  actor,
  input,
}: ActorServiceArgs<CheckSubmissionEligibilityInput>): Promise<SubmissionEligibility> {
  const { target: requested } = input;
  const referenced: Viewability =
    requested.kind === "stewardship"
      ? await claimViewability(container, claimSubject(requested))
      : await referenceViewability(
          container,
          referencedTargets(Targets.byIndividual(actor.accountId, requested), [
            "listing",
          ]),
        );
  return container.unitOfWorkProvider.run(async (ctx) => {
    const target =
      requested.kind === "stewardship"
        ? await claimTarget(ctx, actor, claimSubject(requested))
        : Targets.byIndividual(actor.accountId, requested);
    if (target.kind === "listingRevision") {
      const listing =
        (await ctx.listingRepository.findById(target.listingId))?.entity ??
        null;
      const place =
        listing === null
          ? null
          : ((await ctx.placeRepository.findById(listing.placeId))?.entity ??
            null);
      const findings = await readSubmissionFindings(
        ctx,
        target,
        { listing: await readListingFacts(ctx, listing) },
        viewabilityOf(
          referenced,
          listingViewability(
            { kind: "listing", id: target.listingId },
            listing,
            place,
          ),
        ),
      );
      return eligibility(target, findings, null);
    }
    const findings = await readSubmissionFindings(
      ctx,
      target,
      await readPremiseFacts(ctx, target),
      referenced,
    );
    return eligibility(
      target,
      findings,
      target.kind === "stewardship"
        ? await readPlaceHasSteward(ctx, target.placeId)
        : null,
    );
  });
}

async function claimViewability(
  container: ActorServiceArgs<unknown>["container"],
  subject: ClaimSubject,
): Promise<Viewability> {
  const placeId = await claimedPlace(container, subject);
  return placeId === null
    ? new Map()
    : referenceViewability(container, [{ kind: "place", id: placeId }]);
}

function eligibility(
  target: ApplicationTarget,
  findings: Awaited<ReturnType<typeof readSubmissionFindings>>,
  placeHasSteward: boolean | null,
): SubmissionEligibility {
  return {
    target,
    accepted: SubmissionScope.accepts(findings),
    brokenPremises: findings.premise.holds ? [] : findings.premise.broken,
    unviewable: findings.unviewable,
    activeDuplicate: findings.activeDuplicate,
    placeHasSteward,
  };
}
