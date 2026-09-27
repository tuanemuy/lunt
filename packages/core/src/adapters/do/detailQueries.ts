import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { ListingId, PhotoId, type PlaceId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type {
  ListingEntry,
  PlaceEntry,
  SubstituteCover,
} from "@repo/core/domain/discovery/entry";
import type {
  DetailQueries,
  ListingsOfPlaceQuery,
} from "@repo/core/domain/discovery/ports/detailQueries";
import { isBusinessRuleError } from "@repo/core/domain/error";
import { Listing } from "@repo/core/domain/listing/listing";
import { Framing } from "@repo/core/domain/listing/values";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";
import type {
  ListingEntryRecord,
  PlaceEntryRecord,
  SubstituteCoverRecord,
} from "./protocol/discovery";
import { listingFromRecord } from "./repositories/listingRepository";
import { DoPlaceRepository } from "./repositories/placeRepository";

const integrity = (message: string, cause?: unknown): SystemError =>
  new SystemError(SystemErrorCode.DataIntegrityError, message, cause);

function substituteCoverFrom(
  record: SubstituteCoverRecord,
  idGenerator: IdGenerator,
): SubstituteCover {
  const malformed = [record.listingId, record.photo.photoId].find(
    (id) => idGenerator.parse(id) === null,
  );
  if (malformed !== undefined) {
    throw integrity(`Stored substitute cover has malformed id: ${malformed}`);
  }
  try {
    return {
      listingId: ListingId.create(record.listingId),
      photo: {
        photoId: PhotoId.create(record.photo.photoId),
        framing:
          record.photo.framing === null
            ? null
            : Framing.create(record.photo.framing),
      },
    };
  } catch (error) {
    if (isBusinessRuleError(error)) {
      throw integrity("Stored substitute cover violates invariants", error);
    }
    throw error;
  }
}

/** A stored place entry; `DATA_INTEGRITY_ERROR` when it is not one. */
export function placeEntryFrom(
  record: PlaceEntryRecord,
  idGenerator: IdGenerator,
): PlaceEntry {
  return {
    place: DoPlaceRepository.toPlace(record.place, idGenerator),
    regions: [],
    substituteCover:
      record.substituteCover === null
        ? null
        : substituteCoverFrom(record.substituteCover, idGenerator),
  };
}

/**
 * A stored listing entry. The object returns viewable listings only, so a
 * listing that is not published is a data-integrity failure.
 */
export function listingEntryFrom(
  record: ListingEntryRecord,
  idGenerator: IdGenerator,
): ListingEntry {
  const listing = listingFromRecord(record.listing, idGenerator);
  if (!Listing.isPublished(listing)) {
    throw integrity(`Viewable listing ${listing.id} is not published`);
  }
  return { listing, place: placeEntryFrom(record.place, idGenerator) };
}

/**
 * `DetailQueries` over the Lunt state object: the object selects viewable
 * targets from Place's and Listing's tables (`store/discovery.ts`); this
 * side rehydrates them. Read-only; never joins a unit of work.
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
}
