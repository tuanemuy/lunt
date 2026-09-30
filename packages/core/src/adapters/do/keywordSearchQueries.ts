import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { PublishedArticle } from "@repo/core/domain/article/article";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type {
  ListingEntry,
  PlaceEntry,
  Scored,
} from "@repo/core/domain/discovery/entry";
import type {
  KeywordSearchQueries,
  OccasionSearch,
  PlaceSearch,
} from "@repo/core/domain/discovery/ports/keywordSearchQueries";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import {
  listingEntryFrom,
  placeEntryFrom,
  publishedArticleFrom,
  publishedOccasionFrom,
  publishedRegionFrom,
  scoredFrom,
} from "./discoveryRecords";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";

const scoredPlace = scoredFrom(placeEntryFrom);
const scoredListing = scoredFrom(listingEntryFrom);
const scoredRegion = scoredFrom(publishedRegionFrom);
const scoredOccasion = scoredFrom(publishedOccasionFrom);
const scoredArticle = scoredFrom(publishedArticleFrom);

/**
 * `KeywordSearchQueries` over the Lunt state object: the object scores
 * every viewable candidate with the domains' `searchableText` and
 * `KeywordRelevance` (`store/discovery.ts`); this side rehydrates the
 * page. Read-only; never joins a unit of work.
 */
export class DoKeywordSearchQueries implements KeywordSearchQueries {
  constructor(
    private readonly client: Pick<LuntStateClient, "query">,
    private readonly idGenerator: IdGenerator,
  ) {}

  searchPlaces(
    query: PlaceSearch,
    pagination: Pagination,
  ): Promise<PaginationResult<Scored<PlaceEntry>>> {
    return mapDoError("Failed to search places", async () => {
      const page = await this.client.query("discovery.searchPlaces", {
        terms: query.keyword.terms,
        vacantOnly: query.vacantOnly,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) =>
          scoredPlace(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  searchListings(
    keyword: SearchKeyword,
    pagination: Pagination,
  ): Promise<PaginationResult<Scored<ListingEntry>>> {
    return mapDoError("Failed to search listings", async () => {
      const page = await this.client.query("discovery.searchListings", {
        terms: keyword.terms,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) =>
          scoredListing(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  searchRegions(
    keyword: SearchKeyword,
    pagination: Pagination,
  ): Promise<PaginationResult<Scored<PublishedRegion>>> {
    return mapDoError("Failed to search regions", async () => {
      const page = await this.client.query("discovery.searchRegions", {
        terms: keyword.terms,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) =>
          scoredRegion(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  searchOccasions(
    query: OccasionSearch,
    pagination: Pagination,
  ): Promise<PaginationResult<Scored<PublishedOccasion>>> {
    return mapDoError("Failed to search occasions", async () => {
      const page = await this.client.query("discovery.searchOccasions", {
        terms: query.keyword.terms,
        openOnly: query.openOnly,
        today: query.today,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) =>
          scoredOccasion(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  searchArticles(
    keyword: SearchKeyword,
    pagination: Pagination,
  ): Promise<PaginationResult<Scored<PublishedArticle>>> {
    return mapDoError("Failed to search articles", async () => {
      const page = await this.client.query("discovery.searchArticles", {
        terms: keyword.terms,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) =>
          scoredArticle(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }
}
