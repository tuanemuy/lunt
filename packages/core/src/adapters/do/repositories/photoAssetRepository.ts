import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { PhotoId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { ScanResult } from "@repo/core/domain/common/scan";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import type { PhotoAssetRepository } from "@repo/core/domain/media/ports/photoAssetRepository";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { PhotoAssetRecord } from "../protocol/media";
import { restoreScanPage } from "../scan";

/**
 * `PhotoAssetRepository` over the Lunt state object. Reads query the
 * object immediately; writes append commands to the unit of work's
 * buffer, applied — with the id uniqueness (deleted ids included) and the
 * optimistic lock — when the unit of work commits.
 */
export class DoPhotoAssetRepository implements PhotoAssetRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toVersioned(record: PhotoAssetRecord): Versioned<PhotoAsset> {
    const ids = [record.id, record.registeredBy, record.owner?.id].filter(
      (id): id is string => id !== undefined,
    );
    const malformed = ids.find((id) => this.idGenerator.parse(id) === null);
    if (malformed !== undefined) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored photo has malformed id: ${malformed}`,
      );
    }
    try {
      return {
        entity: PhotoAsset.reconstruct({
          ...record,
          consentedAt: new Date(record.consentedAt),
          registeredAt: new Date(record.registeredAt),
        }),
        expectedVersion: record.version as ExpectedVersion<PhotoAsset>,
      };
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored photo violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private static toRecord(photo: PhotoAsset): PhotoAssetRecord {
    const snapshot = PhotoAsset.snapshot(photo);
    return {
      ...snapshot,
      consentedAt: snapshot.consentedAt.getTime(),
      registeredAt: snapshot.registeredAt.getTime(),
    };
  }

  findById(id: PhotoId): Promise<Versioned<PhotoAsset> | null> {
    return mapDoError("Failed to find photo", async () => {
      const record = await this.client.query("media.photo.findById", { id });
      return record === null ? null : this.toVersioned(record);
    });
  }

  async findByIds(
    ids: readonly PhotoId[],
  ): Promise<readonly Versioned<PhotoAsset>[]> {
    IdBatch.assertWithinLimit(ids);
    if (ids.length === 0) return [];
    return mapDoError("Failed to find photos", async () => {
      const records = await this.client.query("media.photo.findByIds", {
        ids: [...ids],
      });
      return records.map((record) => this.toVersioned(record));
    });
  }

  findPageSweepable(
    registeredBefore: Date,
    pagination: Pagination,
  ): Promise<ScanResult<Versioned<PhotoAsset>>> {
    return mapDoError("Failed to find sweepable photos", async () => {
      const page = await this.client.query("media.photo.findPageSweepable", {
        registeredBefore: registeredBefore.getTime(),
        page: pagination.page,
        limit: pagination.limit,
      });
      return restoreScanPage(
        page,
        (record) => record.id,
        (record) => this.toVersioned(record),
      );
    });
  }

  async insert(photo: PhotoAsset): Promise<void> {
    this.writes.push({
      kind: "media.photo.insert",
      record: DoPhotoAssetRepository.toRecord(photo),
    });
  }

  async save(
    photo: PhotoAsset,
    expectedVersion: ExpectedVersion<PhotoAsset>,
  ): Promise<void> {
    this.writes.push({
      kind: "media.photo.save",
      record: DoPhotoAssetRepository.toRecord(photo),
      expectedVersion,
    });
  }

  async delete(
    id: PhotoId,
    expectedVersion: ExpectedVersion<PhotoAsset>,
  ): Promise<void> {
    this.writes.push({ kind: "media.photo.delete", id, expectedVersion });
  }
}
