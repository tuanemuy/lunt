import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { TakedownClaimId } from "@repo/core/domain/common/ids";
import { Pagination } from "@repo/core/domain/common/pagination";
import { ContentRef } from "@repo/core/domain/common/refs";
import type { ClaimantStanding } from "@repo/core/domain/moderation/values";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { describeTargets } from "./reads";

export type ListOpenTakedownClaimsInput = Readonly<{ pagination: Pagination }>;

export type OpenTakedownClaimRow = Readonly<{
  claimId: TakedownClaimId;
  standing: ClaimantStanding;
  target: ContentRef;
  /** `null` when the target is gone (or an unnamed draft). */
  targetName: string | null;
  email: EmailAddress;
  receivedAt: Date;
}>;

export type ListOpenTakedownClaimsOutput = Readonly<{
  items: readonly OpenTakedownClaimRow[];
  /** Every open claim. */
  count: number;
}>;

/**
 * The open takedown claims awaiting the operators, received oldest first
 * (`spec/usecases/moderation.md` 「listOpenTakedownClaims」; OPE-01 / OM-01).
 * Targets are named whether viewers can see them or not.
 *
 * - `ForbiddenError` without `operate_service`.
 * - `BusinessRuleError` `COMMON_INVALID_INPUT` for an invalid pagination.
 */
export async function listOpenTakedownClaims({
  container,
  actor,
  input,
}: ActorServiceArgs<ListOpenTakedownClaimsInput>): Promise<ListOpenTakedownClaimsOutput> {
  const pagination = Pagination.create(input.pagination);
  const page = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    return ctx.takedownClaimRepository.findOpen(pagination);
  });
  const described = await describeTargets(
    container.contentDirectory,
    page.items.map((claim) => claim.ground.target),
  );
  return {
    items: page.items.map((claim) => ({
      claimId: claim.id,
      standing: claim.ground.standing,
      target: claim.ground.target,
      targetName:
        described.get(ContentRef.key(claim.ground.target))?.name ?? null,
      email: claim.email,
      receivedAt: claim.receivedAt,
    })),
    count: page.count,
  };
}
