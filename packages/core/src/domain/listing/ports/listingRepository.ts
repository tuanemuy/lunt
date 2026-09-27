import type {
  CategoryId,
  ListingId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type { TransactionalRepository } from "@repo/core/domain/common/transactionalRepository";
import type { Listing, ListingShelf, PublicationShelf } from "../listing";
import type { OfferingPhase } from "../offering";

/** A place's listings counted per publication shelf and per offering phase; each side sums to the total. */
export type ListingShelfCounts = Readonly<{
  publication: Readonly<Record<PublicationShelf, number>>;
  phase: Readonly<Record<OfferingPhase, number>>;
}>;

/**
 * Persistence of listings and the management-side queries
 * (`spec/domains/listing.md` 「ListingRepository」).
 *
 * - `insert`: `ConflictError` when the id is taken — including by a
 *   deleted listing (the port remembers deleted ids; B-27).
 * - `save` / `delete`: `ConflictError` on a version mismatch, `NotFoundError`
 *   when none is stored (deleted included). A deleted listing leaves every
 *   query.
 * - `findByIds`: 0–100 ids (`COMMON_INVALID_INPUT` above), stored ones
 *   only, in no particular order; any state.
 * - `findPageByPlace`: the place's listings in `shelf`
 *   (`Listing.inShelf`), newest `updatedAt` first, ties by id.
 * - `countByPlace`: every listing of the place per shelf and per phase.
 * - `findPageAttachable`: the place's listings `Listing.attachableIds`
 *   keeps, newest `updatedAt` first, ties by id.
 * - `findPageByCategories`: listings whose stored `categoryId` is in
 *   `categoryIds` (no `resolve`; no size limit; empty → empty), any state,
 *   by id.
 * - `searchForOperation`: listings `KeywordRelevance.matches`
 *   (`ListingMatching.searchableText`), any state, by relevance
 *   descending, ties by id.
 *
 * Phases compare `today` with the days `Offering.startsOn` /
 * `Offering.lastAvailableOn` gave at `insert` / `save` and the manual end;
 * the adapter holds no schedule rule. Committed writes show immediately.
 */
export interface ListingRepository
  extends TransactionalRepository<Listing, ListingId> {
  findByIds(ids: readonly ListingId[]): Promise<readonly Listing[]>;
  findPageByPlace(
    placeId: PlaceId,
    shelf: ListingShelf,
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<Listing>>;
  countByPlace(placeId: PlaceId, today: LocalDate): Promise<ListingShelfCounts>;
  findPageAttachable(
    placeId: PlaceId,
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<Listing>>;
  findPageByCategories(
    categoryIds: readonly CategoryId[],
    pagination: Pagination,
  ): Promise<PaginationResult<Listing>>;
  searchForOperation(
    keyword: SearchKeyword,
    pagination: Pagination,
  ): Promise<PaginationResult<Listing>>;
}
