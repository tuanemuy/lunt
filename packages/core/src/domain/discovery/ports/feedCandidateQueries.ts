import type { GeoPoint } from "@repo/core/domain/common/geo";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import type { ResolvedCriteria } from "../browseCriteria";
import type { ListingEntry } from "../entry";

export type FeedQuery = Readonly<{
  criteria: ResolvedCriteria;
  /** Orders by distance from here when given, else newest first. */
  origin: GeoPoint | null;
  today: LocalDate;
}>;

/**
 * The feed's candidates (`spec/domains/discovery.md`
 * 「FeedCandidateQueries」), in the discovery scene. Read-only; never joins
 * a unit of work and reflects every committed write at once. Ties break by
 * id ascending; `count` is the total.
 *
 * - `findListings`: the feed listings (viewable, `available` on `today`, at
 *   a place not permanently closed — temporarily closed places and
 *   listings attached to participations included) matching
 *   `BrowseCriteria.matchesListing`. Newest first (`firstPublishedAt`
 *   descending) without `origin`; with it, by the place's distance
 *   (`Geo.distanceMeters`), then newest first.
 * - `findRegionFrames`: viewable regions an affiliated place of which (any
 *   affiliation, not only the displayed one) has a listing `findListings`
 *   returns for the same criteria. Newest first without `origin`; with it,
 *   by the nearest point of `RegionFootprint.of(…, "reference")`, then
 *   newest first.
 * - `findOccasionFrames`: viewable upcoming or ongoing occasions with at
 *   least one viewable participating place (attached listings and their
 *   offering do not matter) whose venue is in the chosen areas; categories
 *   never apply. 「開催日の順」 (period start, then end) without `origin`;
 *   with it, by the venue's distance, then newest first.
 *
 * Article frames come from `ExplorationQueries.findArticles` (stage 5).
 */
export interface FeedCandidateQueries {
  findListings(
    query: FeedQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<ListingEntry>>;
  findRegionFrames(
    query: FeedQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedRegion>>;
  findOccasionFrames(
    query: FeedQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedOccasion>>;
}
