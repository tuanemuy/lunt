import type { AccountId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type {
  TransactionalRepository,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { Stewardship } from "../stewardship";

/**
 * Stewardships, keyed by target (`kind` and `id` together) and resolvable
 * by steward (`spec/domains/authority.md` 「StewardshipRepository」).
 * Stewardships are never deleted.
 *
 * - `insert`: `ConflictError` when the target already has one.
 * - `findById`: `null` when none is stored — read it as
 *   `Stewardship.vacant(target)` (`Stewardship.orVacant`).
 * - `save`: `ConflictError` on a version mismatch, `NotFoundError` when
 *   none is stored.
 * - `findByTargets`: 0–100 targets (`COMMON_INVALID_INPUT` above), stored
 *   ones only, in no particular order.
 * - `findPageBySteward`: the stewardships the account is a steward of
 *   (not merely invited to), ordered place, region, occasion, then target
 *   id; `count` is the total. Callers needing all of them read every page.
 */
export interface StewardshipRepository
  extends Omit<TransactionalRepository<Stewardship, StewardedRef>, "delete"> {
  findByTargets(
    targets: readonly StewardedRef[],
  ): Promise<readonly Stewardship[]>;
  findPageBySteward(
    accountId: AccountId,
    pagination: Pagination,
  ): Promise<PaginationResult<Versioned<Stewardship>>>;
}
