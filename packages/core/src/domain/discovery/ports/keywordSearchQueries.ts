import type { PublishedArticle } from "@repo/core/domain/article/article";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import type { ListingEntry, PlaceEntry, Scored } from "../entry";

export type PlaceSearch = Readonly<{
  keyword: SearchKeyword;
  /** `SelectionScope.admitsPlace`: only places without a steward. */
  vacantOnly: boolean;
}>;

export type OccasionSearch = Readonly<{
  keyword: SearchKeyword;
  /** `SelectionScope.admitsOccasion`: only upcoming and ongoing occasions. */
  openOnly: boolean;
  today: LocalDate;
}>;

/**
 * Keyword search and selection candidates (`spec/domains/discovery.md`
 * 「KeywordSearchQueries」), in the reference scene: upcoming and ended
 * listings, closed places and ended or cancelled occasions are included;
 * places without photos too. Each kind matches viewable targets whose
 * `SearchRelevance` text `KeywordRelevance.matches`, with `relevance` its
 * `KeywordRelevance.relevance`; ranked by relevance descending, then
 * newest first, then id. `vacantOnly` / `openOnly` narrow the range; the
 * page and `count` are decided inside it. Kinds page independently and
 * take no browse criteria. Read-only; never joins a unit of work.
 * Articles match on `Article.searchableText` (title, then body).
 *
 * An adapter may match on the `SearchableText` it stored, normalised by
 * `KeywordRelevance`, when it wrote the target (`spec/domains/index.md`
 * 「キーワードの一致」). A target whose stored values cannot be restored
 * into its `SearchableText` is then in no result — not an error.
 */
export interface KeywordSearchQueries {
  searchPlaces(
    query: PlaceSearch,
    pagination: Pagination,
  ): Promise<PaginationResult<Scored<PlaceEntry>>>;
  searchListings(
    keyword: SearchKeyword,
    pagination: Pagination,
  ): Promise<PaginationResult<Scored<ListingEntry>>>;
  searchRegions(
    keyword: SearchKeyword,
    pagination: Pagination,
  ): Promise<PaginationResult<Scored<PublishedRegion>>>;
  searchOccasions(
    query: OccasionSearch,
    pagination: Pagination,
  ): Promise<PaginationResult<Scored<PublishedOccasion>>>;
  searchArticles(
    keyword: SearchKeyword,
    pagination: Pagination,
  ): Promise<PaginationResult<Scored<PublishedArticle>>>;
}
