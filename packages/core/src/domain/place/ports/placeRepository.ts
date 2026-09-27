import type { PlaceId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { TransactionalRepository } from "@repo/core/domain/common/transactionalRepository";
import type { PlaceMatchCriteria } from "../matching";
import type { Place } from "../place";

/**
 * Places (`spec/domains/place.md` 「PlaceRepository」). Places are never
 * deleted. Only the `PlaceId` is unique — names and addresses may repeat.
 * Committed writes show in every read at once.
 *
 * - `insert`: `ConflictError` when the id is taken.
 * - `findById`: `null` when absent; suspended places included.
 * - `save`: optimistic lock — `ConflictError` on a version mismatch,
 *   `NotFoundError` when absent. Every change (profile, status, revision,
 *   suspension, takedown) races on the same version.
 * - `findByIds`: 0–100 ids (`COMMON_INVALID_INPUT` above), existing ones
 *   only, suspended included, in no particular order.
 * - `match`: every place `PlaceMatching.matches` accepts, by
 *   `PlaceMatching.relevance` descending then id ascending; `count` is the
 *   total, a page past the end is empty. Only `includeSuspended` filters —
 *   operating status never does.
 */
export interface PlaceRepository
  extends Omit<TransactionalRepository<Place, PlaceId>, "delete"> {
  findByIds(ids: readonly PlaceId[]): Promise<readonly Place[]>;
  match(
    criteria: PlaceMatchCriteria,
    pagination: Pagination,
  ): Promise<PaginationResult<Place>>;
}
