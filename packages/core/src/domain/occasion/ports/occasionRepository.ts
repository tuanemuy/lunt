import type { OccasionId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type { TransactionalRepository } from "@repo/core/domain/common/transactionalRepository";
import type { Occasion } from "../occasion";

/**
 * Persistence of occasions and the management-side reads
 * (`spec/domains/occasion.md` 「OccasionRepository」). Occasions are never
 * deleted.
 *
 * - `insert`: `ConflictError` when the id is taken.
 * - `save`: `ConflictError` on a version mismatch, `NotFoundError` when
 *   none is stored. Every state change (content, publication,
 *   cancellation, suspension, takedown) races on this one version.
 * - `findByIds`: 0–100 ids (`COMMON_INVALID_INPUT` above), stored ones
 *   only, in no particular order; any publication, suspension or
 *   holding status.
 * - `searchForOperation`: occasions `KeywordRelevance.matches`
 *   (`Occasion.searchableText`), any state, by relevance descending, ties
 *   by id ascending.
 *
 * Committed writes show immediately.
 */
export interface OccasionRepository
  extends Omit<TransactionalRepository<Occasion, OccasionId>, "delete"> {
  findByIds(ids: readonly OccasionId[]): Promise<readonly Occasion[]>;
  searchForOperation(
    keyword: SearchKeyword,
    pagination: Pagination,
  ): Promise<PaginationResult<Occasion>>;
}
