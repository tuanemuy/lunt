import type { Account } from "@repo/core/domain/account/entity";
import type { AccountRepository } from "@repo/core/domain/account/ports/accountRepository";
import type { Actor } from "@repo/core/domain/common/actor";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { AccountId } from "@repo/core/domain/common/ids";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import { NotFoundError, UnauthorizedError } from "../errors";

/** Accounts by id, read 100 at a time (`findByIds` takes at most 100). */
export async function findAccountsByIds(
  accountRepository: AccountRepository,
  ids: readonly AccountId[],
): Promise<ReadonlyMap<AccountId, Account>> {
  const unique = [...new Set(ids)];
  const found = new Map<AccountId, Account>();
  for (let start = 0; start < unique.length; start += IdBatch.maxSize) {
    const batch = unique.slice(start, start + IdBatch.maxSize);
    for (const account of await accountRepository.findByIds(batch)) {
      found.set(account.id, account);
    }
  }
  return found;
}

/**
 * The actor's own account. `null` means the actor withdrew after the
 * boundary built the `Actor`: the request is treated as signed out
 * (`spec/domains/index.md` 「操作する人」).
 */
export async function requireActorAccount(
  accountRepository: AccountRepository,
  actor: Actor,
): Promise<Versioned<Account>> {
  const found = await accountRepository.findById(actor.accountId);
  if (found === null) {
    throw new UnauthorizedError("LOGIN_REQUIRED", "Login required");
  }
  return found;
}

/** The account a grant names by email address; `NotFoundError` when none. */
export async function requireAccountByEmail(
  accountRepository: AccountRepository,
  email: EmailAddress,
): Promise<Versioned<Account>> {
  const found = await accountRepository.findByEmail(email);
  if (found === null) {
    throw new NotFoundError(
      "ACCOUNT_NOT_FOUND",
      "No account has the email address",
    );
  }
  return found;
}
