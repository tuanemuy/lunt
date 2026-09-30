import type { PublishedArticle } from "@repo/core/domain/article/article";
import type {
  ArticleId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import type { ListingEntry, ParticipantEntry, PlaceEntry } from "../entry";
import type { Scene } from "../scene";

export type ListingsOfPlaceQuery = Readonly<{
  placeId: PlaceId;
  scene: Scene;
  today: LocalDate;
}>;

/** The target whose occasions `findOccasionsRelatedTo` reads. */
export type OccasionSubject =
  | Readonly<{ kind: "listing"; id: ListingId }>
  | Readonly<{ kind: "place"; id: PlaceId }>
  | Readonly<{ kind: "region"; id: RegionId }>;

/**
 * Detail targets and their related reads (`spec/domains/discovery.md`
 * 「DetailQueries」). Read-only; never joins a unit of work and reflects
 * every committed write at once.
 *
 * - `findListing` / `findPlace` / `findRegion` / `findOccasion` /
 *   `findArticle`: the viewable target, or `null` when it is not viewable
 *   or does not exist (the two are not told apart, CS-06). An article's
 *   showcases are as stored, viewable or not. Upcoming and ended listings,
 *   closed places, and ended or cancelled occasions are returned
 *   (reference scene). A listing's `categoryId` is the stored one; the
 *   caller resolves it.
 * - `findListingsOfPlace`: the place's viewable listings admitted by
 *   `scene` on `today`, in 「店舗の掲載の順」 — offering phase
 *   `available`, `upcoming`, `ended`, then newest first
 *   (`firstPublishedAt` descending), ties by `ListingId` ascending. Empty
 *   when the place is not viewable or does not exist. `count` is the total.
 * - `findOccasionsRelatedTo` (discovery scene): upcoming and ongoing
 *   viewable occasions whose participation attaches the listing, the place
 *   takes part in, or `linked` to the region; empty when the subject is
 *   not viewable. 「開催日の順」 (period start, then end, then id). Every
 *   match — no paging.
 * - `findParticipants` (reference scene): the occasion's viewable places
 *   (closed ones included) in participation order (`participatedAt`
 *   ascending, then `PlaceId`), each with its viewable attached listings
 *   in attach order (any offering phase). Empty when the occasion is not
 *   viewable. Every participant — no paging.
 * - `findRegionsOfOccasion`: viewable regions `linked` to a viewable
 *   occasion, in link order (`linkedAt` ascending, then `RegionId`).
 * - `findArticlesShowcasing`: published articles whose showcases hold
 *   `ref` itself (a place's listing does not count), each once, newest
 *   first (`firstPublishedAt` descending, then `ArticleId`). Empty
 *   (`count` 0) when the target is not viewable or does not exist. For
 *   viewers — unlike `ArticleRepository.findPublishedByShowcases`.
 */
export interface DetailQueries {
  findListing(listingId: ListingId): Promise<ListingEntry | null>;
  findPlace(placeId: PlaceId): Promise<PlaceEntry | null>;
  findRegion(regionId: RegionId): Promise<PublishedRegion | null>;
  findOccasion(occasionId: OccasionId): Promise<PublishedOccasion | null>;
  findArticle(articleId: ArticleId): Promise<PublishedArticle | null>;
  findListingsOfPlace(
    query: ListingsOfPlaceQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<ListingEntry>>;
  findOccasionsRelatedTo(
    subject: OccasionSubject,
    today: LocalDate,
  ): Promise<readonly PublishedOccasion[]>;
  findParticipants(
    occasionId: OccasionId,
  ): Promise<readonly ParticipantEntry[]>;
  findRegionsOfOccasion(
    occasionId: OccasionId,
  ): Promise<readonly PublishedRegion[]>;
  findArticlesShowcasing(
    ref: ShowcaseRef,
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedArticle>>;
}
