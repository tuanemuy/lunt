import { type PhotoId, TakedownClaimId } from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import {
  TakedownClaim,
  type TakedownClaimInput,
  type TakedownTargetFacts,
} from "@repo/core/domain/moderation/takedownClaim";
import type { RequestContainer } from "../di/types";
import { ConflictError } from "../errors";
import type { GeneratedId } from "../ports/idGenerator";
import type { ServiceArgs } from "../types";

export type SubmitTakedownClaimInput = Readonly<{
  /** Minted by the caller and resent unchanged on failure. */
  claimId: GeneratedId;
  /** `proprietor` or `photoRightsHolder`; the value object checks it. */
  standing: string;
  target: ContentRef;
  /** The photos to take down; empty for a proprietor. */
  photoIds: readonly PhotoId[];
  reason: string;
  email: string;
}>;

/** The id holds a claim with other content. */
export const TAKEDOWN_CLAIM_ID_CONFLICT = "TAKEDOWN_CLAIM_ID_CONFLICT";

/** Whether the target is viewable and, when it is, its current photos. */
async function readTargetFacts(
  container: RequestContainer,
  target: ContentRef,
): Promise<TakedownTargetFacts> {
  if (!(await container.referenceQueries.isViewable(target))) {
    return { viewable: false };
  }
  const [summary] = await container.contentDirectory.describe([target]);
  const found =
    summary !== undefined && ContentRef.equals(summary.target, target);
  return { viewable: true, photoIds: found ? summary.photoIds : [] };
}

/**
 * Receives a takedown claim without a login (`spec/usecases/moderation.md`
 * 「submitTakedownClaim」; MOD-01 / RQ-07). The claim is stored open and
 * `takedown_claim.submitted` tells the operators. The claimant gets no
 * receipt mail and no way to check the claim.
 *
 * Idempotent create: the same id with the same standing, target, photos,
 * reason and email succeeds without writing or emitting.
 *
 * - `BusinessRuleError`, first failure wins:
 *   `MODERATION_INVALID_TAKEDOWN_GROUND`, `MODERATION_INVALID_TAKEDOWN_REASON`,
 *   `COMMON_INVALID_EMAIL_ADDRESS`, `MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE`,
 *   `MODERATION_TAKEDOWN_CLAIM_PHOTO_NOT_IN_TARGET` (serialized with the
 *   photos no longer on the target as `missing`).
 * - `ConflictError` (`TAKEDOWN_CLAIM_ID_CONFLICT`) when the id holds other
 *   content; `UNIQUE_VIOLATION` when a concurrent submit of the id commits
 *   first.
 */
export async function submitTakedownClaim({
  container,
  input,
}: ServiceArgs<SubmitTakedownClaimInput>): Promise<void> {
  const claim: TakedownClaimInput = {
    id: TakedownClaimId.create(input.claimId),
    standing: input.standing,
    target: input.target,
    photoIds: input.photoIds,
    reason: input.reason,
    email: input.email,
  };
  const facts = await readTargetFacts(container, input.target);
  const now = container.clock.now();
  await container.unitOfWorkProvider.run(
    async ({ takedownClaimRepository, collectEvents }) => {
      const existing = await takedownClaimRepository.findById(claim.id);
      if (existing !== null) {
        if (TakedownClaim.sameSubmission(existing.entity, claim)) return;
        throw new ConflictError(
          TAKEDOWN_CLAIM_ID_CONFLICT,
          "The takedown claim id is already used for another claim",
        );
      }
      const { entity, eventDrafts } = TakedownClaim.submit(claim, facts, now);
      await takedownClaimRepository.insert(entity);
      collectEvents(eventDrafts);
    },
  );
}
