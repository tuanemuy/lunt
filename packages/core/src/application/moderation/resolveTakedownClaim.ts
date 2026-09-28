import type { TakedownClaimId } from "@repo/core/domain/common/ids";
import { TakedownClaim } from "@repo/core/domain/moderation/takedownClaim";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireTakedownClaim } from "./reads";
import { type TakedownClaimView, takedownClaimView } from "./views";

export type ResolveTakedownClaimInput = Readonly<{
  claimId: TakedownClaimId;
  /** What was done, or that nothing was; the value object checks it. */
  outcome: string;
}>;

/**
 * An operator closes a takedown claim with an outcome, whether or not any
 * action was taken, without looking at the target
 * (`spec/usecases/moderation.md` 「resolveTakedownClaim」; MOD-02 / OM-04).
 * Emits `takedown_claim.resolved`, from which Notification mails the
 * outcome to the claimant. Photo removals and suspensions committed
 * earlier are not undone by a failure here.
 *
 * - `ForbiddenError` (`operate_service`, also when revoked before the
 *   commit); `NotFoundError` (`TAKEDOWN_CLAIM_NOT_FOUND`).
 * - `BusinessRuleError`: `MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED`
 *   (checked first), `MODERATION_INVALID_TAKEDOWN_OUTCOME`.
 * - `ConflictError` when a concurrent resolve commits first.
 */
export async function resolveTakedownClaim({
  container,
  actor,
  input,
}: ActorServiceArgs<ResolveTakedownClaimInput>): Promise<TakedownClaimView> {
  const now = container.clock.now();
  const resolved = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const found = await requireTakedownClaim(ctx, input.claimId);
    const { entity, eventDrafts } = TakedownClaim.resolve(
      found.entity,
      input.outcome,
      now,
    );
    await ctx.takedownClaimRepository.save(entity, found.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
  return takedownClaimView(resolved);
}
