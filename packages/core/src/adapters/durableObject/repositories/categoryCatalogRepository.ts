import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import type { CategoryCatalogRepository } from "@repo/core/domain/listing/ports/categoryCatalogRepository";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { CategoryCatalogRecord } from "../protocol/listing";

/**
 * The token `find` hands out while no catalog is stored. Stored versions
 * are never negative, so it cannot match one; `save` turns it into a
 * save-if-absent.
 */
const UNSAVED = -1 as ExpectedVersion<CategoryCatalog>;

/** `CategoryCatalogRepository` over the Lunt state object's one catalog row. */
export class DoCategoryCatalogRepository implements CategoryCatalogRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toCatalog(record: CategoryCatalogRecord): CategoryCatalog {
    const malformed = record.categories
      .flatMap((category) => [
        category.id,
        ...(category.successorId === null ? [] : [category.successorId]),
      ])
      .find((id) => this.idGenerator.parse(id) === null);
    if (malformed !== undefined) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored category catalog has malformed id: ${malformed}`,
      );
    }
    try {
      return CategoryCatalog.reconstruct(record);
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored category catalog violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  find(): Promise<Versioned<CategoryCatalog>> {
    return mapDoError("Failed to find the category catalog", async () => {
      const record = await this.client.query("listing.findCategoryCatalog", {});
      if (record === null) {
        return { entity: CategoryCatalog.empty(), expectedVersion: UNSAVED };
      }
      return {
        entity: this.toCatalog(record),
        expectedVersion: record.version as ExpectedVersion<CategoryCatalog>,
      };
    });
  }

  async save(
    catalog: CategoryCatalog,
    expectedVersion: ExpectedVersion<CategoryCatalog>,
  ): Promise<void> {
    this.writes.push({
      kind: "listing.saveCategoryCatalog",
      record: CategoryCatalog.snapshot(catalog),
      expectedVersion: expectedVersion === UNSAVED ? null : expectedVersion,
    });
  }
}
