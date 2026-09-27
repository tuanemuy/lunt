import { Account } from "@repo/core/domain/account/entity";
import { removeAllAuthorityOf } from "../authority/withdrawal";
import { UnauthorizedError } from "../errors";
import type { ActorServiceArgs } from "../types";

export type WithdrawInput = Readonly<Record<never, never>>;

/**
 * ACC-04 / MY-07: deletes the actor's account and, in the same unit of
 * work, removes it from every stewardship and role roster
 * (`reason: "withdrawn"`). Irreversible. Targets it was the last steward
 * of become vacant; pending invitations stay. Events:
 * `account.withdrawn`, plus `authority.steward_removed` per stewardship,
 * `authority.stewardship_vacated` per vacated target and
 * `authority.role_revoked` per roster. Every read happens before any
 * write; the stewardships, rosters and the account are written against
 * the versions read, so a concurrent appointment or grant (which advances
 * the account's version) makes the whole withdrawal roll back.
 *
 * Errors: `BusinessRuleError` `AUTHORITY_LAST_OPERATOR` (the only
 * operator; nothing changes); `ConflictError` (something changed
 * concurrently — resend); `UnauthorizedError` `LOGIN_REQUIRED` (the
 * account was already withdrawn, e.g. from another device); `NotFoundError`
 * if it is withdrawn between this read and the commit.
 */
export async function withdraw({
  container,
  actor,
}: ActorServiceArgs<WithdrawInput>): Promise<void> {
  const now = container.clock.now();
  await container.unitOfWorkProvider.run(async (ctx) => {
    const read = await ctx.accountRepository.findById(actor.accountId);
    if (read === null) {
      throw new UnauthorizedError("LOGIN_REQUIRED", "Login required");
    }
    const authorityDrafts = await removeAllAuthorityOf(
      ctx,
      actor.accountId,
      now,
    );
    await ctx.accountRepository.delete(actor.accountId, read.expectedVersion);
    ctx.collectEvents([
      ...Account.withdraw(read.entity, now),
      ...authorityDrafts,
    ]);
  });
}
