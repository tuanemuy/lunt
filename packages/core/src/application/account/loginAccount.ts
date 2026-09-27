import type { Account } from "@repo/core/domain/account/entity";
import { LoginPolicy } from "@repo/core/domain/account/loginPolicy";
import type { AccountRepository } from "@repo/core/domain/account/ports/accountRepository";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { AccountId } from "@repo/core/domain/common/ids";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { IdGenerator } from "../ports/idGenerator";

/**
 * The account a successful login lands on. The presentation layer starts
 * the browser's session for `accountId`; the usecase does not.
 */
export type LoginResult = Readonly<{
  accountId: AccountId;
  email: EmailAddress;
}>;

/**
 * Reads the account of `email` and decides, through `LoginPolicy.resolve`,
 * whether the login registers a new one. Read-only: the caller inserts
 * `account` when `registered`, after all its reads.
 */
export async function resolveLoginAccount(
  accountRepository: AccountRepository,
  email: EmailAddress,
  idGenerator: IdGenerator,
): Promise<Readonly<{ account: Account; registered: boolean }>> {
  const existing = await accountRepository.findByEmail(email);
  return LoginPolicy.resolve(
    email,
    existing?.entity ?? null,
    idGenerator.next(),
  );
}

export const toLoginResult = (account: Account): LoginResult => ({
  accountId: account.id,
  email: account.email,
});

/**
 * The version token of a read the domain has just accepted. The domain
 * refuses a missing challenge before this runs, so `null` here is a bug.
 */
export function expectedVersionOf<T>(
  read: Versioned<T> | null,
): ExpectedVersion<T> {
  if (read === null) {
    throw new Error("Accepted a login challenge that was not read");
  }
  return read.expectedVersion;
}
