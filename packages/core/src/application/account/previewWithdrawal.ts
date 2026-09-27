import type { Role } from "@repo/core/domain/authority/role";
import type { StewardedTargetSummary } from "@repo/core/domain/authority/stewardedTarget";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import { ContentRef } from "@repo/core/domain/common/refs";
import { previewAuthorityLoss } from "../authority/withdrawal";
import type { ActorServiceArgs } from "../types";

export type PreviewWithdrawalInput = Readonly<Record<never, never>>;

export type WithdrawalPreview = Readonly<{
  /** `false` exactly when `blockedBy` is set. */
  canWithdraw: boolean;
  /**
   * Why the account cannot withdraw: the first role (in `ROLES` order)
   * whose roster would refuse to lose it — today only the only operator
   * (`RoleRoster.removal` → `last_operator`, AC-76).
   */
  blockedBy: Readonly<{ role: Role; reason: "last_operator" }> | null;
  /**
   * Targets withdrawing would leave without a steward, in
   * `findPageBySteward` order, with their names (`null` for an unnamed
   * draft). Publication and operator suspension do not matter.
   */
  vacates: readonly StewardedTargetSummary[];
}>;

/**
 * ACC-04 / MY-07: what withdrawing would do, judged by Authority exactly as
 * `withdraw` judges at commit — whether the account may withdraw, and
 * which targets it would leave vacant. Reads only the actor's own
 * authority in a unit of work without writes, then names the targets
 * outside it (`StewardedTargetDirectory.describe`, 100 at a time). The
 * situation may change before `withdraw`, which decides on the state at
 * its commit. No errors of its own.
 */
export async function previewWithdrawal({
  container,
  actor,
}: ActorServiceArgs<PreviewWithdrawalInput>): Promise<WithdrawalPreview> {
  const loss = await container.unitOfWorkProvider.run((ctx) =>
    previewAuthorityLoss(ctx, actor.accountId),
  );
  const names = new Map<string, string | null>();
  for (let i = 0; i < loss.vacates.length; i += IdBatch.maxSize) {
    const summaries = await container.stewardedTargetDirectory.describe(
      loss.vacates.slice(i, i + IdBatch.maxSize),
    );
    for (const summary of summaries) {
      names.set(ContentRef.key(summary.target), summary.name);
    }
  }
  return {
    canWithdraw: loss.blockedBy === null,
    blockedBy: loss.blockedBy,
    vacates: loss.vacates.map((target) => ({
      target,
      name: names.get(ContentRef.key(target)) ?? null,
    })),
  };
}
