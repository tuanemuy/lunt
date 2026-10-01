import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type {
  TransactionalRepository,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { LoginChallenge, LoginChallengeId } from "../loginChallenge";
import type { SecretDigest } from "../loginSecret";

/**
 * Login challenges (`spec/domains/account.md` 「LoginChallengeRepository」).
 * There is no single-row `delete`; closed challenges go in bulk.
 *
 * - `insert`: `ConflictError` when the id or the link token digest is
 *   taken — the port guarantees both are unique.
 * - `findById` / `findByLinkTokenDigest`: any stored challenge, whatever
 *   its status or expiry; `LoginChallenge` decides usability.
 * - `countUnexpired`: how many of `email`'s challenges have
 *   `now < expiresAt`, in any status; deleted ones do not count.
 * - `save`: optimistic lock (`ConflictError`); `NotFoundError` when the
 *   challenge is gone, including after `deleteClosedBefore`.
 * - `deleteClosedBefore`: removes every `redeemed` / `exhausted`
 *   challenge and every one with `expiresAt < threshold`, ignoring
 *   versions. Idempotent.
 * - `countClosedBefore`: how many challenges `deleteClosedBefore` with the
 *   same threshold would remove, as stored now.
 */
export interface LoginChallengeRepository
  extends Omit<
    TransactionalRepository<LoginChallenge, LoginChallengeId>,
    "delete"
  > {
  findByLinkTokenDigest(
    digest: SecretDigest,
  ): Promise<Versioned<LoginChallenge> | null>;
  countUnexpired(email: EmailAddress, now: Date): Promise<number>;
  deleteClosedBefore(threshold: Date): Promise<void>;
  countClosedBefore(threshold: Date): Promise<number>;
}
