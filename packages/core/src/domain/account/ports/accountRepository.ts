import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { AccountId } from "@repo/core/domain/common/ids";
import type {
  TransactionalRepository,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { Account } from "../entity";

/**
 * Accounts, resolvable by id and by email address
 * (`spec/domains/account.md` 「AccountRepository」).
 *
 * - `insert`: `ConflictError` when the id or the email address is taken —
 *   the port guarantees email uniqueness; a prior `findByEmail` is no
 *   guarantee.
 * - `findById` / `findByEmail`: only existing accounts; a withdrawn
 *   (deleted) account is never returned.
 * - `findByIds`: 0–100 ids (`BusinessRuleError` `COMMON_INVALID_INPUT`
 *   above that), existing accounts only, in `AccountId` order.
 * - `save` / `delete`: `ConflictError` on a version mismatch,
 *   `NotFoundError` when the account does not exist. After a delete the
 *   same email address can be inserted again.
 */
export interface AccountRepository
  extends TransactionalRepository<Account, AccountId> {
  findByEmail(email: EmailAddress): Promise<Versioned<Account> | null>;
  findByIds(ids: readonly AccountId[]): Promise<readonly Account[]>;
}
