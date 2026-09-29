import type { RegionId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type { TransactionalRepository } from "@repo/core/domain/common/transactionalRepository";
import type { Region } from "../region";

/**
 * Persistence of regions and the management-side reads
 * (`spec/domains/region.md` 「RegionRepository」). Regions are never
 * deleted.
 *
 * - `insert`: `ConflictError` when the id is taken. Names need not be unique.
 * - `save`: `ConflictError` on a version mismatch, `NotFoundError` when none
 *   is stored.
 * - `findByIds`: 0–100 ids (`COMMON_INVALID_INPUT` above), stored ones only,
 *   in no particular order; any publication state, suspended included.
 * - `searchForOperation`: regions `KeywordRelevance.matches`
 *   (`Region.searchableText`), any state, by `KeywordRelevance.relevance`
 *   descending, ties by id ascending.
 *
 * Committed writes show in every read immediately.
 */
export interface RegionRepository
  extends Omit<TransactionalRepository<Region, RegionId>, "delete"> {
  findByIds(ids: readonly RegionId[]): Promise<readonly Region[]>;
  searchForOperation(
    keyword: SearchKeyword,
    pagination: Pagination,
  ): Promise<PaginationResult<Region>>;
}
