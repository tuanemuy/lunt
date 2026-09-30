import type { PublishedArticle } from "@repo/core/domain/article/article";
import type { AreaCode } from "@repo/core/domain/common/areaCode";
import type { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import type { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import type { ResolvedCriteria } from "../browseCriteria";
import type { ListingEntry, PlaceEntry } from "../entry";
import type { MapScope } from "../explorationFocus";
import type { MapGrid } from "../geo";
import type { PlaceCell } from "../mapClustering";
import type { Vicinity } from "../vicinity";

export type ListingsOfRegionQuery = Readonly<{
  regionId: RegionId;
  /** Leave out this place's listings (a listing detail's own place). */
  excludingPlaceId: PlaceId | null;
  today: LocalDate;
}>;

export type PlaceCellsQuery = Readonly<{
  bounds: GeoBounds;
  grid: MapGrid;
  criteria: ResolvedCriteria;
  /** Its affiliated places join whatever the criteria, while it is viewable. */
  selectedRegionId: RegionId | null;
  today: LocalDate;
}>;

export type PlacesInBoundsQuery = Readonly<{
  bounds: GeoBounds;
  criteria: ResolvedCriteria;
  /** Nearest first when given, else newest first. */
  origin: GeoPoint | null;
  today: LocalDate;
}>;

/** Every non-null condition must hold. Categories never apply to regions. */
export type RegionsQuery = Readonly<{
  bounds: GeoBounds | null;
  areaCodes: ReadonlySet<AreaCode> | null;
  vicinity: Vicinity | null;
  /** Nearest first (by the footprint's nearest point) when given, else newest first. */
  origin: GeoPoint | null;
}>;

/**
 * The map, map lists, region lists and occasion list in the discovery
 * scene (`spec/domains/discovery.md` 「ExplorationQueries」). Read-only;
 * never joins a unit of work and reflects every committed write at once.
 * Ties break by id ascending; `count` is the total of matches.
 *
 * - `findPlaceCells`: the viewable, not permanently closed places inside
 *   `bounds` (edges included) matching `BrowseCriteria.matchesPlace`, plus
 *   — while `selectedRegionId` names a viewable region — its affiliated
 *   ones inside `bounds` whatever the criteria; grouped exactly as
 *   `MapClustering.cells(bounds, grid, entries, selectedRegionId)` (with
 *   `null` for a region that is not viewable). Bounded by the grid.
 * - `findMapExtent`: `places` — the `Geo.extentOf` of the viewable, not
 *   permanently closed places in the areas (every area for `null`;
 *   categories never apply); `region` — the extent of the viewable
 *   region's `RegionFootprint.of(…, "discovery")`. `null` when nothing is
 *   gathered or the region is not viewable.
 * - `findPlacesInBounds`: the places of `findPlaceCells` without a
 *   selected region; nearest first with `origin` (`Geo.distanceMeters`,
 *   then newest), else newest first (`registeredAt` descending).
 * - `findRegions`: the viewable regions whose location is inside `bounds`,
 *   `BrowseCriteria.matchesRegion(areaCodes, footprint)` and
 *   `Vicinity.includesRegion(vicinity, footprint)` over
 *   `RegionFootprint.of(…, "reference")`; nearest first with `origin`
 *   (nearest footprint point), else newest first (`firstPublishedAt`).
 * - `findPlacesOfRegion`: the region's viewable, not permanently closed
 *   affiliated places, newest affiliation first (`affiliatedAt`
 *   descending, then `PlaceId`). Empty when the region is not viewable.
 * - `findListingsOfRegion`: the viewable listings available on `today`
 *   at the region's affiliated places that are viewable and not
 *   permanently closed, newest first (`firstPublishedAt` descending, then
 *   `ListingId`); `excludingPlaceId`'s listings left out. Empty when the
 *   region is not viewable.
 * - `findOccasions`: the viewable occasions upcoming or ongoing on `today`
 *   (participants or not), by period start, then end.
 * - `findArticles`: the published articles (showcases or not, viewable or
 *   not), newest first (`firstPublishedAt` descending, then `ArticleId`).
 *   Also the feed's article frames, never narrowed by criteria.
 */
export interface ExplorationQueries {
  findPlaceCells(query: PlaceCellsQuery): Promise<readonly PlaceCell[]>;
  findMapExtent(scope: MapScope): Promise<GeoBounds | null>;
  findPlacesInBounds(
    query: PlacesInBoundsQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<PlaceEntry>>;
  findRegions(
    query: RegionsQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedRegion>>;
  findPlacesOfRegion(
    regionId: RegionId,
    pagination: Pagination,
  ): Promise<PaginationResult<PlaceEntry>>;
  findListingsOfRegion(
    query: ListingsOfRegionQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<ListingEntry>>;
  findOccasions(
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedOccasion>>;
  findArticles(
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedArticle>>;
}
