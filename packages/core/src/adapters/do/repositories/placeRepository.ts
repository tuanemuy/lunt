import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { PlaceId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import type { PlaceMatchCriteria } from "@repo/core/domain/place/matching";
import { Place } from "@repo/core/domain/place/place";
import type { PlaceRepository } from "@repo/core/domain/place/ports/placeRepository";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { PlaceRecord } from "../protocol/place";

/**
 * `PlaceRepository` over the Lunt state object. Reads query the object
 * immediately; writes append commands to the unit of work's buffer, which
 * the object applies — with the id-uniqueness and optimistic-lock checks —
 * when the unit of work commits.
 */
export class DoPlaceRepository implements PlaceRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  /** A stored record as a `Place`; `DATA_INTEGRITY_ERROR` when it is not one. */
  static toPlace(record: PlaceRecord, idGenerator: IdGenerator): Place {
    // The store passes `photo_ids` through unchecked.
    const photoIds: unknown = record.photoIds;
    if (!Array.isArray(photoIds)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored place ${record.id} has malformed photo ids`,
      );
    }
    const malformed = [record.id, ...photoIds].find(
      (id: unknown) => typeof id !== "string" || idGenerator.parse(id) === null,
    );
    if (malformed !== undefined) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored place has malformed id: ${String(malformed)}`,
      );
    }
    try {
      return Place.reconstruct({
        ...record,
        registeredAt: new Date(record.registeredAt),
        updatedAt: new Date(record.updatedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored place violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  static toRecord(place: Place): PlaceRecord {
    const snapshot = Place.snapshot(place);
    return {
      ...snapshot,
      registeredAt: snapshot.registeredAt.getTime(),
      updatedAt: snapshot.updatedAt.getTime(),
    };
  }

  private toPlace(record: PlaceRecord): Place {
    return DoPlaceRepository.toPlace(record, this.idGenerator);
  }

  findById(id: PlaceId): Promise<Versioned<Place> | null> {
    return mapDoError("Failed to find place", async () => {
      const record = await this.client.query("place.findById", { id });
      return record === null
        ? null
        : {
            entity: this.toPlace(record),
            expectedVersion: record.version as ExpectedVersion<Place>,
          };
    });
  }

  async findByIds(ids: readonly PlaceId[]): Promise<readonly Place[]> {
    IdBatch.assertWithinLimit(ids);
    if (ids.length === 0) return [];
    return mapDoError("Failed to find places", async () => {
      const records = await this.client.query("place.findByIds", { ids });
      return records.map((record) => this.toPlace(record));
    });
  }

  match(
    criteria: PlaceMatchCriteria,
    pagination: Pagination,
  ): Promise<PaginationResult<Place>> {
    return mapDoError("Failed to match places", async () => {
      const result = await this.client.query("place.match", {
        name: criteria.text.name,
        address: criteria.text.address,
        includeSuspended: criteria.includeSuspended,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: result.items.map((record) => this.toPlace(record)),
        count: result.count,
      };
    });
  }

  async insert(place: Place): Promise<void> {
    this.writes.push({
      kind: "place.insert",
      record: DoPlaceRepository.toRecord(place),
    });
  }

  async save(
    place: Place,
    expectedVersion: ExpectedVersion<Place>,
  ): Promise<void> {
    this.writes.push({
      kind: "place.save",
      record: DoPlaceRepository.toRecord(place),
      expectedVersion,
    });
  }
}
