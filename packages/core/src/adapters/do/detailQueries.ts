import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type {
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
import type {
  ListingEntry,
  ParticipantEntry,
  PlaceEntry,
} from "@repo/core/domain/discovery/entry";
import type {
  DetailQueries,
  ListingsOfPlaceQuery,
  OccasionSubject,
} from "@repo/core/domain/discovery/ports/detailQueries";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import {
  listingEntryFrom,
  participantEntryFrom,
  placeEntryFrom,
  publishedOccasionFrom,
  publishedRegionFrom,
} from "./discoveryRecords";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";

/**
 * `DetailQueries` over the Lunt state object: the object selects viewable
 * targets from the domains' tables (`store/discovery.ts`); this side
 * rehydrates them. Read-only; never joins a unit of work.
 */
export class DoDetailQueries implements DetailQueries {
  constructor(
    private readonly client: Pick<LuntStateClient, "query">,
    private readonly idGenerator: IdGenerator,
  ) {}

  findListing(listingId: ListingId): Promise<ListingEntry | null> {
    return mapDoError("Failed to find listing detail", async () => {
      const record = await this.client.query("discovery.findListing", {
        listingId,
      });
      return record === null
        ? null
        : listingEntryFrom(record, this.idGenerator);
    });
  }

  findPlace(placeId: PlaceId): Promise<PlaceEntry | null> {
    return mapDoError("Failed to find place detail", async () => {
      const record = await this.client.query("discovery.findPlace", {
        placeId,
      });
      return record === null ? null : placeEntryFrom(record, this.idGenerator);
    });
  }

  findRegion(regionId: RegionId): Promise<PublishedRegion | null> {
    return mapDoError("Failed to find region detail", async () => {
      const record = await this.client.query("discovery.findRegion", {
        regionId,
      });
      return record === null
        ? null
        : publishedRegionFrom(record, this.idGenerator);
    });
  }

  findOccasion(occasionId: OccasionId): Promise<PublishedOccasion | null> {
    return mapDoError("Failed to find occasion detail", async () => {
      const record = await this.client.query("discovery.findOccasion", {
        occasionId,
      });
      return record === null
        ? null
        : publishedOccasionFrom(record, this.idGenerator);
    });
  }

  findListingsOfPlace(
    query: ListingsOfPlaceQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<ListingEntry>> {
    return mapDoError("Failed to find listings of place", async () => {
      const page = await this.client.query("discovery.findListingsOfPlace", {
        placeId: query.placeId,
        scene: query.scene,
        today: query.today,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) =>
          listingEntryFrom(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  findOccasionsRelatedTo(
    subject: OccasionSubject,
    today: LocalDate,
  ): Promise<readonly PublishedOccasion[]> {
    return mapDoError("Failed to find related occasions", async () => {
      const records = await this.client.query(
        "discovery.findOccasionsRelatedTo",
        { subject: { kind: subject.kind, id: subject.id }, today },
      );
      return records.map((record) =>
        publishedOccasionFrom(record, this.idGenerator),
      );
    });
  }

  findParticipants(
    occasionId: OccasionId,
  ): Promise<readonly ParticipantEntry[]> {
    return mapDoError("Failed to find participants", async () => {
      const records = await this.client.query("discovery.findParticipants", {
        occasionId,
      });
      return records.map((record) =>
        participantEntryFrom(record, this.idGenerator),
      );
    });
  }

  findRegionsOfOccasion(
    occasionId: OccasionId,
  ): Promise<readonly PublishedRegion[]> {
    return mapDoError("Failed to find regions of occasion", async () => {
      const records = await this.client.query(
        "discovery.findRegionsOfOccasion",
        { occasionId },
      );
      return records.map((record) =>
        publishedRegionFrom(record, this.idGenerator),
      );
    });
  }
}
