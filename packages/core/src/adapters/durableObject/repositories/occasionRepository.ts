import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { OccasionId } from "@repo/core/domain/common/ids";
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
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type { OccasionRepository } from "@repo/core/domain/occasion/ports/occasionRepository";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { OccasionRecord } from "../protocol/occasion";

/**
 * Rebuilds a stored occasion: every stored id must be one the generator
 * could have minted, and the snapshot must pass `Occasion.reconstruct`;
 * either failure is `DATA_INTEGRITY_ERROR`.
 */
export function occasionFromRecord(
  record: OccasionRecord,
  idGenerator: IdGenerator,
): Occasion {
  const malformed = [record.id, ...record.content.photoIds].find(
    (id) => idGenerator.parse(id) === null,
  );
  if (malformed !== undefined) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Stored occasion has malformed id: ${malformed}`,
    );
  }
  try {
    return Occasion.reconstruct(record);
  } catch (error) {
    if (isRehydrationError(error)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Stored occasion violates invariants",
        error,
      );
    }
    throw error;
  }
}

/**
 * `OccasionRepository` over the Lunt state object. Reads rehydrate through
 * `Occasion.reconstruct`; writes buffer in the unit of work.
 */
export class DoOccasionRepository implements OccasionRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toOccasion(record: OccasionRecord): Occasion {
    return occasionFromRecord(record, this.idGenerator);
  }

  async insert(occasion: Occasion): Promise<void> {
    this.writes.push({
      kind: "occasion.insert",
      record: Occasion.snapshot(occasion),
    });
  }

  findById(id: OccasionId): Promise<Versioned<Occasion> | null> {
    return mapDoError("Failed to find occasion", async () => {
      const record = await this.client.query("occasion.findById", { id });
      if (record === null) return null;
      return {
        entity: this.toOccasion(record),
        expectedVersion: record.version as ExpectedVersion<Occasion>,
      };
    });
  }

  async save(
    occasion: Occasion,
    expectedVersion: ExpectedVersion<Occasion>,
  ): Promise<void> {
    this.writes.push({
      kind: "occasion.save",
      record: Occasion.snapshot(occasion),
      expectedVersion,
    });
  }

  async findByIds(ids: readonly OccasionId[]): Promise<readonly Occasion[]> {
    IdBatch.assertWithinLimit(ids);
    if (ids.length === 0) return [];
    return mapDoError("Failed to find occasions", async () =>
      (await this.client.query("occasion.findByIds", { ids })).map((record) =>
        this.toOccasion(record),
      ),
    );
  }

  searchForOperation(
    keyword: SearchKeyword,
    pagination: Pagination,
  ): Promise<PaginationResult<Occasion>> {
    return mapDoError("Failed to search occasions", async () => {
      const page = await this.client.query("occasion.searchForOperation", {
        terms: keyword.terms,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) => this.toOccasion(record)),
        count: page.count,
      };
    });
  }
}
