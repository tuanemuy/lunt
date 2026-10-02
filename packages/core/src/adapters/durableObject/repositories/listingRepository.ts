import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { IdBatch } from "@repo/core/domain/common/idBatch";
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
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import { Listing, type ListingShelf } from "@repo/core/domain/listing/listing";
import { Offering } from "@repo/core/domain/listing/offering";
import type {
  ListingRepository,
  ListingShelfCounts,
} from "@repo/core/domain/listing/ports/listingRepository";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type {
  ListingPage,
  ListingRecord,
  ListingScheduleRecord,
} from "../protocol/listing";

/**
 * Rebuilds a stored listing: every stored id must be one the generator
 * could have minted, and the snapshot must pass `Listing.reconstruct`;
 * either failure is `DATA_INTEGRITY_ERROR`.
 */
export function listingFromRecord(
  record: ListingRecord,
  idGenerator: IdGenerator,
): Listing {
  const ids = [
    record.id,
    record.placeId,
    ...(record.content.categoryId === null ? [] : [record.content.categoryId]),
    ...record.content.photos.map((photo) => photo.photoId),
  ];
  const malformed = ids.find((id) => idGenerator.parse(id) === null);
  if (malformed !== undefined) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Stored listing has malformed id: ${malformed}`,
    );
  }
  try {
    return Listing.reconstruct(record);
  } catch (error) {
    if (isRehydrationError(error)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Stored listing violates invariants",
        error,
      );
    }
    throw error;
  }
}

const scheduleOf = (listing: Listing): ListingScheduleRecord => ({
  startsOn: Offering.startsOn(listing.content.offering),
  lastAvailableOn: Offering.lastAvailableOn(listing.content.offering),
});

/**
 * `ListingRepository` over the Lunt state object. Reads rehydrate through
 * `Listing.reconstruct`; writes buffer in the unit of work and apply at
 * commit, each carrying the offering's boundary days computed here.
 */
export class DoListingRepository implements ListingRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toListing(record: ListingRecord): Listing {
    return listingFromRecord(record, this.idGenerator);
  }

  private toPage(page: ListingPage): PaginationResult<Listing> {
    return {
      items: page.items.map((record) => this.toListing(record)),
      count: page.count,
    };
  }

  async insert(listing: Listing): Promise<void> {
    this.writes.push({
      kind: "listing.insert",
      record: Listing.snapshot(listing),
      schedule: scheduleOf(listing),
    });
  }

  isDeleted(id: ListingId): Promise<boolean> {
    return mapDoError("Failed to read deleted listings", () =>
      this.client.query("listing.isDeleted", { id }),
    );
  }

  findById(id: ListingId): Promise<Versioned<Listing> | null> {
    return mapDoError("Failed to find listing", async () => {
      const record = await this.client.query("listing.findById", { id });
      if (record === null) return null;
      return {
        entity: this.toListing(record),
        expectedVersion: record.version as ExpectedVersion<Listing>,
      };
    });
  }

  async save(
    listing: Listing,
    expectedVersion: ExpectedVersion<Listing>,
  ): Promise<void> {
    this.writes.push({
      kind: "listing.save",
      record: Listing.snapshot(listing),
      schedule: scheduleOf(listing),
      expectedVersion,
    });
  }

  async delete(
    id: ListingId,
    expectedVersion: ExpectedVersion<Listing>,
  ): Promise<void> {
    this.writes.push({ kind: "listing.delete", id, expectedVersion });
  }

  async findByIds(ids: readonly ListingId[]): Promise<readonly Listing[]> {
    IdBatch.assertWithinLimit(ids);
    if (ids.length === 0) return [];
    return mapDoError("Failed to find listings", async () =>
      (await this.client.query("listing.findByIds", { ids })).map((record) =>
        this.toListing(record),
      ),
    );
  }

  findPageByPlace(
    placeId: PlaceId,
    shelf: ListingShelf,
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<Listing>> {
    return mapDoError("Failed to list listings of a place", async () =>
      this.toPage(
        await this.client.query("listing.findPageByPlace", {
          placeId,
          shelf: { publication: shelf.publication, phase: shelf.phase },
          today,
          page: pagination.page,
          limit: pagination.limit,
        }),
      ),
    );
  }

  countByPlace(
    placeId: PlaceId,
    today: LocalDate,
  ): Promise<ListingShelfCounts> {
    return mapDoError("Failed to count listings of a place", () =>
      this.client.query("listing.countByPlace", { placeId, today }),
    );
  }

  findPageAttachable(
    placeId: PlaceId,
    _today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<Listing>> {
    return mapDoError("Failed to list attachable listings", async () =>
      this.toPage(
        await this.client.query("listing.findPageAttachable", {
          placeId,
          page: pagination.page,
          limit: pagination.limit,
        }),
      ),
    );
  }

  findPageByCategories(
    categoryIds: readonly CategoryId[],
    pagination: Pagination,
  ): Promise<PaginationResult<Listing>> {
    return mapDoError("Failed to list listings by category", async () =>
      this.toPage(
        await this.client.query("listing.findPageByCategories", {
          categoryIds,
          page: pagination.page,
          limit: pagination.limit,
        }),
      ),
    );
  }

  searchForOperation(
    keyword: SearchKeyword,
    pagination: Pagination,
  ): Promise<PaginationResult<Listing>> {
    return mapDoError("Failed to search listings", async () =>
      this.toPage(
        await this.client.query("listing.searchForOperation", {
          terms: keyword.terms,
          page: pagination.page,
          limit: pagination.limit,
        }),
      ),
    );
  }
}
