import type { LocalDate } from "@repo/core/domain/common/localDate";
import { Pagination } from "@repo/core/domain/common/pagination";
import { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import {
  type ListingSummary,
  type OccasionSummary,
  type PlaceSummary,
  type RegionSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import type { RequestContainer } from "../di/types";
import type { ServiceArgs } from "../types";
import {
  listingSummaryPhotoIds,
  occasionSummaryPhotoIds,
  type PhotoRefs,
  photoRefsOf,
  placeSummaryPhotoIds,
  regionSummaryPhotoIds,
  todayOf,
} from "./views";

/**
 * The kinds a keyword search reads, in the order the results show them.
 * Articles join with stage 5.
 */
export const SEARCH_KINDS = ["place", "region", "listing", "occasion"] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

export type SearchByKeywordInput = Readonly<{
  /** Raw text; blank is refused (`SearchKeyword.create`). */
  keyword: string;
  /** Every kind, or one kind (to read that kind's further pages). */
  kinds: "all" | SearchKind;
  /** Applied to each kind read, independently. */
  pagination: Pagination;
}>;

/** One kind's page, by relevance, and its total. */
export type SearchPage<T> = Readonly<{ items: readonly T[]; count: number }>;

/**
 * Each kind read, with its standing (reference scene: upcoming and ended
 * listings, closed places, ended and cancelled occasions included). A kind
 * not read is `null`.
 */
export type SearchResults = Readonly<{
  place: SearchPage<PlaceSummary> | null;
  region: SearchPage<RegionSummary> | null;
  listing: SearchPage<ListingSummary> | null;
  occasion: SearchPage<OccasionSummary> | null;
}>;

export type SearchByKeywordOutput = Readonly<{
  results: SearchResults;
  photos: PhotoRefs;
}>;

const displayed = { kind: "displayed" } as const;

async function searchPlaces(
  container: RequestContainer,
  keyword: SearchKeyword,
  pagination: Pagination,
): Promise<SearchPage<PlaceSummary>> {
  const page = await container.keywordSearchQueries.searchPlaces(
    { keyword, vacantOnly: false },
    pagination,
  );
  return {
    items: page.items.map(({ entry }) =>
      ViewProjection.placeSummary(entry, displayed),
    ),
    count: page.count,
  };
}

async function searchRegions(
  container: RequestContainer,
  keyword: SearchKeyword,
  pagination: Pagination,
): Promise<SearchPage<RegionSummary>> {
  const page = await container.keywordSearchQueries.searchRegions(
    keyword,
    pagination,
  );
  return {
    items: page.items.map(({ entry }) => ViewProjection.regionSummary(entry)),
    count: page.count,
  };
}

async function searchListings(
  container: RequestContainer,
  keyword: SearchKeyword,
  pagination: Pagination,
  today: LocalDate,
): Promise<SearchPage<ListingSummary>> {
  const page = await container.keywordSearchQueries.searchListings(
    keyword,
    pagination,
  );
  return {
    items: page.items.map(({ entry }) =>
      ViewProjection.listingSummary(entry, displayed, today),
    ),
    count: page.count,
  };
}

async function searchOccasions(
  container: RequestContainer,
  keyword: SearchKeyword,
  pagination: Pagination,
  today: LocalDate,
): Promise<SearchPage<OccasionSummary>> {
  const page = await container.keywordSearchQueries.searchOccasions(
    { keyword, openOnly: false, today },
    pagination,
  );
  return {
    items: page.items.map(({ entry }) =>
      ViewProjection.occasionSummary(entry, today),
    ),
    count: page.count,
  };
}

const photoIdsOf = (results: SearchResults) => [
  ...(results.place?.items.flatMap(placeSummaryPhotoIds) ?? []),
  ...(results.region?.items.flatMap(regionSummaryPhotoIds) ?? []),
  ...(results.listing?.items.flatMap(listingSummaryPhotoIds) ?? []),
  ...(results.occasion?.items.flatMap(occasionSummaryPhotoIds) ?? []),
];

/**
 * DIS-05 (VW-03): targets matching the keyword, per kind — places, regions,
 * listings, occasions (articles join with stage 5) — each by relevance
 * (`KeywordRelevance`, then newest first) and paged on its own. Reference
 * scene: each summary carries its standing; places without photos show
 * their substitute cover. The browse criteria never apply. No match in any
 * kind is an empty result, not an error. Needs no login.
 *
 * @throws BusinessRuleError `COMMON_INVALID_SEARCH_KEYWORD` for an empty,
 *   blank or over-long keyword (no search is made); `COMMON_INVALID_INPUT`
 *   for a pagination out of bounds.
 */
export async function searchByKeyword({
  container,
  input,
}: ServiceArgs<SearchByKeywordInput>): Promise<SearchByKeywordOutput> {
  const keyword = SearchKeyword.create(input.keyword);
  const pagination = Pagination.create(input.pagination);
  const today = todayOf(container);
  const reads = (kind: SearchKind) =>
    input.kinds === "all" || input.kinds === kind;
  const [place, region, listing, occasion] = await Promise.all([
    reads("place") ? searchPlaces(container, keyword, pagination) : null,
    reads("region") ? searchRegions(container, keyword, pagination) : null,
    reads("listing")
      ? searchListings(container, keyword, pagination, today)
      : null,
    reads("occasion")
      ? searchOccasions(container, keyword, pagination, today)
      : null,
  ]);
  const results: SearchResults = { place, region, listing, occasion };
  return {
    results,
    photos: await photoRefsOf(container, photoIdsOf(results)),
  };
}
