import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { ListingEntry } from "@repo/core/domain/discovery/entry";
import type {
  FeedCandidateQueries,
  FeedQuery,
} from "@repo/core/domain/discovery/ports/feedCandidateQueries";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import {
  listingEntryFrom,
  publishedOccasionFrom,
  publishedRegionFrom,
} from "./discoveryRecords";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";
import type { FeedQueryRecord } from "./protocol/discoveryFeed";

const setOrNull = (
  values: ReadonlySet<string> | null,
): readonly string[] | null => (values === null ? null : [...values]);

const recordOf = (
  query: FeedQuery,
  pagination: Pagination,
): FeedQueryRecord => ({
  areaCodes: setOrNull(query.criteria.areaCodes),
  categoryIds: setOrNull(query.criteria.categoryIds),
  origin:
    query.origin === null
      ? null
      : {
          latitude: query.origin.latitude,
          longitude: query.origin.longitude,
        },
  today: query.today,
  page: pagination.page,
  limit: pagination.limit,
});

/**
 * `FeedCandidateQueries` over the Lunt state object
 * (`store/discoveryFeed.ts` selects and orders; this side rehydrates).
 * Read-only; never joins a unit of work.
 */
export class DoFeedCandidateQueries implements FeedCandidateQueries {
  constructor(
    private readonly client: Pick<LuntStateClient, "query">,
    private readonly idGenerator: IdGenerator,
  ) {}

  findListings(
    query: FeedQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<ListingEntry>> {
    return mapDoError("Failed to find feed listings", async () => {
      const page = await this.client.query(
        "discovery.findFeedListings",
        recordOf(query, pagination),
      );
      return {
        items: page.items.map((record) =>
          listingEntryFrom(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  findRegionFrames(
    query: FeedQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedRegion>> {
    return mapDoError("Failed to find feed region frames", async () => {
      const page = await this.client.query(
        "discovery.findFeedRegionFrames",
        recordOf(query, pagination),
      );
      return {
        items: page.items.map((record) =>
          publishedRegionFrom(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  findOccasionFrames(
    query: FeedQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedOccasion>> {
    return mapDoError("Failed to find feed occasion frames", async () => {
      const page = await this.client.query(
        "discovery.findFeedOccasionFrames",
        recordOf(query, pagination),
      );
      return {
        items: page.items.map((record) =>
          publishedOccasionFrom(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }
}
