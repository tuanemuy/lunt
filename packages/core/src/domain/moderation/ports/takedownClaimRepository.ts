import type { TakedownClaimId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { TransactionalRepository } from "@repo/core/domain/common/transactionalRepository";
import type { OpenTakedownClaim, TakedownClaim } from "../takedownClaim";

/**
 * Takedown claims (`spec/domains/moderation.md` 「TakedownClaimRepository」),
 * reached through the unit of work as `takedownClaimRepository`. Claims are
 * never deleted, so there is no `delete`.
 *
 * - `insert`: `ConflictError` when the id is taken. No other uniqueness;
 *   the target is not checked.
 * - `findById`: `null` when absent.
 * - `save`: `ConflictError` on a version mismatch, `NotFoundError` when
 *   absent.
 * - `findOpen`: the open claims, `receivedAt` oldest first, ties by id
 *   ascending; `count` is every open claim.
 *
 * Committed writes show in every later read.
 */
export interface TakedownClaimRepository
  extends Omit<
    TransactionalRepository<TakedownClaim, TakedownClaimId>,
    "delete"
  > {
  findOpen(
    pagination: Pagination,
  ): Promise<PaginationResult<OpenTakedownClaim>>;
}
