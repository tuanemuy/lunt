import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { OccasionId, RegionId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import type { RegionLinkRepository } from "@repo/core/domain/occasion/ports/regionLinkRepository";
import {
  RegionLink,
  type RegionLinkKey,
} from "@repo/core/domain/occasion/regionLink";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { Page, RegionLinkRecord } from "../protocol/occasion";

/**
 * Rebuilds a stored region link; a malformed id or a broken invariant is
 * `DATA_INTEGRITY_ERROR`.
 */
export function regionLinkFromRecord(
  record: RegionLinkRecord,
  idGenerator: IdGenerator,
): RegionLink {
  const malformed = [record.occasionId, record.regionId].find(
    (id) => idGenerator.parse(id) === null,
  );
  if (malformed !== undefined) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Stored region link has malformed id: ${malformed}`,
    );
  }
  try {
    return RegionLink.reconstruct(record);
  } catch (error) {
    if (isRehydrationError(error)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Stored region link violates invariants",
        error,
      );
    }
    throw error;
  }
}

/** `RegionLinkRepository` over the Lunt state object. */
export class DoRegionLinkRepository implements RegionLinkRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toPage(page: Page<RegionLinkRecord>): PaginationResult<RegionLink> {
    return {
      items: page.items.map((record) =>
        regionLinkFromRecord(record, this.idGenerator),
      ),
      count: page.count,
    };
  }

  async insert(link: RegionLink): Promise<void> {
    this.writes.push({
      kind: "occasion.insertRegionLink",
      record: RegionLink.snapshot(link),
    });
  }

  findById(key: RegionLinkKey): Promise<Versioned<RegionLink> | null> {
    return mapDoError("Failed to find region link", async () => {
      const record = await this.client.query("occasion.findRegionLink", {
        occasionId: key.occasionId,
        regionId: key.regionId,
      });
      if (record === null) return null;
      return {
        entity: regionLinkFromRecord(record, this.idGenerator),
        expectedVersion: record.version as ExpectedVersion<RegionLink>,
      };
    });
  }

  async save(
    link: RegionLink,
    expectedVersion: ExpectedVersion<RegionLink>,
  ): Promise<void> {
    this.writes.push({
      kind: "occasion.saveRegionLink",
      record: RegionLink.snapshot(link),
      expectedVersion,
    });
  }

  async delete(
    key: RegionLinkKey,
    expectedVersion: ExpectedVersion<RegionLink>,
  ): Promise<void> {
    this.writes.push({
      kind: "occasion.deleteRegionLink",
      key: { occasionId: key.occasionId, regionId: key.regionId },
      expectedVersion,
    });
  }

  findByOccasion(
    occasionId: OccasionId,
    pagination: Pagination,
  ): Promise<PaginationResult<RegionLink>> {
    return mapDoError("Failed to list region links of an occasion", async () =>
      this.toPage(
        await this.client.query("occasion.findRegionLinksByOccasion", {
          occasionId,
          page: pagination.page,
          limit: pagination.limit,
        }),
      ),
    );
  }

  findByRegion(
    regionId: RegionId,
    pagination: Pagination,
  ): Promise<PaginationResult<RegionLink>> {
    return mapDoError("Failed to list region links of a region", async () =>
      this.toPage(
        await this.client.query("occasion.findRegionLinksByRegion", {
          regionId,
          page: pagination.page,
          limit: pagination.limit,
        }),
      ),
    );
  }
}
