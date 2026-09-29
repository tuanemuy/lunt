import type { OccasionId, RegionId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { TransactionalRepository } from "@repo/core/domain/common/transactionalRepository";
import type { RegionLink, RegionLinkKey } from "../regionLink";

/**
 * Persistence of region links, keyed by the occasion and region pair
 * (`spec/domains/occasion.md` 「RegionLinkRepository」).
 *
 * - `insert`: `ConflictError` when the pair has a link, linked or
 *   detached — a detached pair cannot be linked anew while it remains.
 * - `findById`: the pair's link in either status, or `null`.
 * - `save` / `delete`: `ConflictError` on a version mismatch,
 *   `NotFoundError` when none is stored. An unlink (`delete`) committed
 *   first makes a concurrent detach's `save` a `NotFoundError`; a detach
 *   committed first makes the unlink a `ConflictError`.
 * - `findByOccasion`: the occasion's links, linked and detached, by
 *   `linkedAt` ascending, ties by `RegionId` ascending.
 * - `findByRegion`: the region's links, linked and detached, newest
 *   `linkedAt` first, ties by `OccasionId` ascending.
 *
 * The occasion and region referred to are not checked. Committed writes
 * show immediately.
 */
export interface RegionLinkRepository
  extends TransactionalRepository<RegionLink, RegionLinkKey> {
  findByOccasion(
    occasionId: OccasionId,
    pagination: Pagination,
  ): Promise<PaginationResult<RegionLink>>;
  findByRegion(
    regionId: RegionId,
    pagination: Pagination,
  ): Promise<PaginationResult<RegionLink>>;
}
