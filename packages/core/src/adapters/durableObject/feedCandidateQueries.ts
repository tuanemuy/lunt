import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { ListingId, PlaceId, RegionId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { ListingEntry } from "@repo/core/domain/discovery/entry";
import type { FeedListingCandidate } from "@repo/core/domain/discovery/feedComposer";
import type {
  FeedCandidateQueries,
  FeedListingCandidates,
  FeedQuery,
} from "@repo/core/domain/discovery/ports/feedCandidateQueries";
import { BusinessRuleError } from "@repo/core/domain/error";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import {
  listingEntryFrom,
  publishedOccasionFrom,
  publishedRegionFrom,
} from "./discoveryRecords";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";
import type {
  FeedCandidateRecord,
  FeedCriteriaRecord,
  FeedQueryRecord,
} from "./protocol/discoveryFeed";

const setOrNull = (
  values: ReadonlySet<string> | null,
): readonly string[] | null => (values === null ? null : [...values]);

const criteriaOf = (query: FeedQuery): FeedCriteriaRecord => ({
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
});

const recordOf = (
  query: FeedQuery,
  pagination: Pagination,
): FeedQueryRecord => ({
  ...criteriaOf(query),
  page: pagination.page,
  limit: pagination.limit,
});

const integrity = (message: string): SystemError =>
  new SystemError(SystemErrorCode.DataIntegrityError, message);

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

  findListingCandidates(
    query: FeedQuery,
    upTo: number,
  ): Promise<FeedListingCandidates> {
    if (!Number.isSafeInteger(upTo) || upTo < 1) {
      return Promise.reject(
        new BusinessRuleError(
          CommonErrorCode.InvalidInput,
          `upTo must be a positive integer: ${upTo}`,
        ),
      );
    }
    return mapDoError("Failed to find feed listing candidates", async () => {
      const read = await this.client.query(
        "discovery.findFeedListingCandidates",
        { ...criteriaOf(query), upTo },
      );
      return {
        candidates: read.candidates.map((record) => this.candidateOf(record)),
        count: read.count,
      };
    });
  }

  private candidateOf(record: FeedCandidateRecord): FeedListingCandidate {
    const ids = [record.listingId, record.placeId, record.regionId];
    const malformed = ids.find(
      (id) => id !== null && this.idGenerator.parse(id) === null,
    );
    if (malformed !== undefined) {
      throw integrity(`Stored feed candidate has malformed id: ${malformed}`);
    }
    return {
      listingId: ListingId.create(record.listingId),
      placeId: PlaceId.create(record.placeId),
      regionId:
        record.regionId === null ? null : RegionId.create(record.regionId),
    };
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
