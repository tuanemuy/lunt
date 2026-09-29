import type { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { ListingEntry, PlaceEntry } from "../entry";

export type ListingsOfRegionQuery = Readonly<{
  regionId: RegionId;
  /** Leave out this place's listings (a listing detail's own place). */
  excludingPlaceId: PlaceId | null;
  today: LocalDate;
}>;

/**
 * Region-wide lists in the discovery scene (`spec/domains/discovery.md`
 * 「ExplorationQueries」). Read-only; never joins a unit of work and
 * reflects every committed write at once. Neither read takes the browse
 * criteria.
 *
 * - `findPlacesOfRegion`: the region's viewable, not permanently closed
 *   affiliated places, newest affiliation first (`affiliatedAt`
 *   descending, then `PlaceId`). Empty when the region is not viewable.
 * - `findListingsOfRegion`: the viewable listings available on `today`
 *   at the region's affiliated places that are viewable and not
 *   permanently closed, newest first (`firstPublishedAt` descending, then
 *   `ListingId`); `excludingPlaceId`'s listings left out. Empty when the
 *   region is not viewable.
 *
 * The map, map lists, region search, occasion and article lists join
 * with stage 4 (`findPlaceCells`, `findMapExtent`, `findPlacesInBounds`,
 * `findRegions`, `findOccasions`) and stage 5 (`findArticles`).
 */
export interface ExplorationQueries {
  findPlacesOfRegion(
    regionId: RegionId,
    pagination: Pagination,
  ): Promise<PaginationResult<PlaceEntry>>;
  findListingsOfRegion(
    query: ListingsOfRegionQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<ListingEntry>>;
}
