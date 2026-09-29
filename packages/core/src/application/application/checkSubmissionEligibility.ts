import {
  type ApplicationTarget,
  type IndividualTargetInput,
  type PlaceTargetInput,
  SubmissionScope,
  ApplicationTarget as Targets,
} from "@repo/core/domain/application/application";
import type { PremiseKey } from "@repo/core/domain/application/premise";
import type { SubmissionTarget } from "@repo/core/domain/application/subject";
import type { ApplicationId, PlaceId } from "@repo/core/domain/common/ids";
import type { ActorServiceArgs } from "../types";
import { actingFor } from "./applicant";
import {
  listingViewability,
  occasionViewability,
  readListingFacts,
  readParticipationFacts,
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
 * target, a stewardship claim referring to a registration (a
 * reapplication for the claim filed with it), or a steward's target filed
 * as the place.
 */
export type EligibilityTargetInput =
  | IndividualTargetInput
  | ReferringClaim
  | StewardTargetInput;

/** A stewardship claim referring to a registration. */
export type ReferringClaim = Readonly<{
  kind: "stewardship";
  registrationId: ApplicationId;
}>;

/**
 * A steward's affiliation, leave or participation, filed as `placeId`
 * (`ApplicationTarget.byPlace`); checking it needs `act_as_place` on the
 * place.
 */
export type StewardTargetInput = PlaceTargetInput &
  Readonly<{ applicant: "place"; placeId: PlaceId }>;

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
  input: Readonly<{ placeId: PlaceId }> | ReferringClaim,
): ClaimSubject =>
  "registrationId" in input
    ? { registrationId: input.registrationId }
    : { placeId: input.placeId };

type Requested =
  | Readonly<{ kind: "claim"; subject: ClaimSubject }>
  | Readonly<{ kind: "built"; target: ApplicationTarget }>;

/** The target built from input alone, or the claim whose target needs a read. */
function requested(
  actor: ActorServiceArgs<unknown>["actor"],
  input: EligibilityTargetInput,
): Requested {
  if ("applicant" in input) {
    const { applicant: _, placeId, ...placeInput } = input;
    return { kind: "built", target: Targets.byPlace(placeId, placeInput) };
  }
  if (input.kind === "stewardship") {
    return { kind: "claim", subject: claimSubject(input) };
  }
  return {
    kind: "built",
    target: Targets.byIndividual(actor.accountId, input),
  };
}

/**
 * Before an application is entered — also before a reapplication
 * (`prepareReapplication`) and for each candidate of a target choice
 * (CF-02: RQ-05's regions, RQ-06's occasions) — whether its submission
 * would be accepted (SHP-04, SHP-08, LST-12, LST-13, REG-01〜REG-03,
 * EVT-01, APP-04; `spec/usecases/application.md`
 * 「checkSubmissionEligibility」). The same findings as the submission,
 * returned instead of thrown; nothing is written. A registration is
 * always accepted. The listing a revision names (with its place) and the
 * occasion a participation names are read as aggregates; other targets
 * are asked of `ReferenceQueries`.
 *
 * - `ForbiddenError` for a steward's target when `act_as_place` refuses.
 * - `NotFoundError` when the referred registration is missing, not a
 *   registration or someone else's.
 */
export async function checkSubmissionEligibility({
  container,
  actor,
  input,
}: ActorServiceArgs<CheckSubmissionEligibilityInput>): Promise<SubmissionEligibility> {
  const request = requested(actor, input.target);
  const referenced: Viewability =
    request.kind === "claim"
      ? await claimViewability(container, request.subject)
      : await referenceViewability(
          container,
          referencedTargets(request.target, ["listing", "occasion"]),
        );
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    const target =
      request.kind === "claim"
        ? await claimTarget(ctx, actor, request.subject)
        : request.target;
    if (target.applicant.kind === "place") {
      await actingFor(ctx, actor, target.applicant);
    }
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
    if (target.kind === "participation") {
      const occasion =
        (await ctx.occasionRepository.findById(target.occasionId))?.entity ??
        null;
      const findings = await readSubmissionFindings(
        ctx,
        target,
        await readParticipationFacts(ctx, target, occasion, now),
        viewabilityOf(
          referenced,
          occasionViewability(target.occasionId, occasion),
        ),
      );
      return eligibility(target, findings, null);
    }
    const findings = await readSubmissionFindings(
      ctx,
      target,
      await readPremiseFacts(ctx, target, now),
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
