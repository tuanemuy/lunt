import type { ListingId, PlaceId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { ListingEntry, PlaceEntry } from "../entry";
import type { Scene } from "../scene";

export type ListingsOfPlaceQuery = Readonly<{
  placeId: PlaceId;
  scene: Scene;
  today: LocalDate;
}>;

/**
 * Detail targets and their related reads (`spec/domains/discovery.md`
 * 「DetailQueries」). Read-only; never joins a unit of work and reflects
 * every committed write at once.
 *
 * - `findListing` / `findPlace`: the viewable target, or `null` when it is
 *   not viewable or does not exist (the two are not told apart, CS-06).
 *   Upcoming and ended listings and closed places are returned (reference
 *   scene). A listing's `categoryId` is the stored one; the caller
 *   resolves it.
 * - `findListingsOfPlace`: the place's viewable listings admitted by
 *   `scene` on `today`, in 「店舗の掲載の順」 — offering phase
 *   `available`, `upcoming`, `ended`, then newest first
 *   (`firstPublishedAt` descending), ties by `ListingId` ascending. Empty
 *   when the place is not viewable or does not exist. `count` is the total.
 *
 * Regions, occasions and articles (`findRegion`, `findOccasion`,
 * `findArticle`, `findOccasionsRelatedTo`, `findParticipants`,
 * `findRegionsOfOccasion`, `findArticlesShowcasing`) join with stages 3
 * and 5.
 */
export interface DetailQueries {
  findListing(listingId: ListingId): Promise<ListingEntry | null>;
  findPlace(placeId: PlaceId): Promise<PlaceEntry | null>;
  findListingsOfPlace(
    query: ListingsOfPlaceQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<ListingEntry>>;
}
