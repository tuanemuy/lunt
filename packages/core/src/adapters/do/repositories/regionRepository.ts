import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { RegionId } from "@repo/core/domain/common/ids";
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
import type { RegionRepository } from "@repo/core/domain/region/ports/regionRepository";
import { Region } from "@repo/core/domain/region/region";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { RegionRecord } from "../protocol/region";

/**
 * `RegionRepository` over the Lunt state object. Reads query the object
 * immediately; writes append commands to the unit of work's buffer, which
 * the object applies — with the id-uniqueness and optimistic-lock checks —
 * when the unit of work commits.
 */
export class DoRegionRepository implements RegionRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  /** A stored record as a `Region`; `DATA_INTEGRITY_ERROR` when it is not one. */
  static toRegion(record: RegionRecord, idGenerator: IdGenerator): Region {
    // The store passes `photo_ids` through unchecked.
    const photoIds: unknown = record.content.photoIds;
    if (!Array.isArray(photoIds)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored region ${record.id} has malformed photo ids`,
      );
    }
    const malformed = [record.id, ...photoIds].find(
      (id: unknown) => typeof id !== "string" || idGenerator.parse(id) === null,
    );
    if (malformed !== undefined) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored region has malformed id: ${String(malformed)}`,
      );
    }
    const { firstPublishedAt } = record.publication;
    try {
      return Region.reconstruct({
        ...record,
        publication: {
          ...record.publication,
          firstPublishedAt:
            firstPublishedAt === null ? null : new Date(firstPublishedAt),
        },
        updatedAt: new Date(record.updatedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored region violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  static toRecord(region: Region): RegionRecord {
    const snapshot = Region.snapshot(region);
    return {
      ...snapshot,
      publication: {
        ...snapshot.publication,
        firstPublishedAt:
          snapshot.publication.firstPublishedAt?.getTime() ?? null,
      },
      updatedAt: snapshot.updatedAt.getTime(),
    };
  }

  private toRegion(record: RegionRecord): Region {
    return DoRegionRepository.toRegion(record, this.idGenerator);
  }

  findById(id: RegionId): Promise<Versioned<Region> | null> {
    return mapDoError("Failed to find region", async () => {
      const record = await this.client.query("region.findById", { id });
      return record === null
        ? null
        : {
            entity: this.toRegion(record),
            expectedVersion: record.version as ExpectedVersion<Region>,
          };
    });
  }

  async findByIds(ids: readonly RegionId[]): Promise<readonly Region[]> {
    IdBatch.assertWithinLimit(ids);
    if (ids.length === 0) return [];
    return mapDoError("Failed to find regions", async () => {
      const records = await this.client.query("region.findByIds", { ids });
      return records.map((record) => this.toRegion(record));
    });
  }

  searchForOperation(
    keyword: SearchKeyword,
    pagination: Pagination,
  ): Promise<PaginationResult<Region>> {
    return mapDoError("Failed to search regions", async () => {
      const result = await this.client.query("region.searchForOperation", {
        terms: keyword.terms,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: result.items.map((record) => this.toRegion(record)),
        count: result.count,
      };
    });
  }

  async insert(region: Region): Promise<void> {
    this.writes.push({
      kind: "region.insert",
      record: DoRegionRepository.toRecord(region),
    });
  }

  async save(
    region: Region,
    expectedVersion: ExpectedVersion<Region>,
  ): Promise<void> {
    this.writes.push({
      kind: "region.save",
      record: DoRegionRepository.toRecord(region),
      expectedVersion,
    });
  }
}
