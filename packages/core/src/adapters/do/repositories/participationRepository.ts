import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import {
  Participation,
  type ParticipationKey,
} from "@repo/core/domain/occasion/participation";
import type { ParticipationRepository } from "@repo/core/domain/occasion/ports/participationRepository";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { Page, ParticipationRecord } from "../protocol/occasion";

/**
 * Rebuilds a stored participation; a malformed id or a broken invariant is
 * `DATA_INTEGRITY_ERROR`.
 */
export function participationFromRecord(
  record: ParticipationRecord,
  idGenerator: IdGenerator,
): Participation {
  const malformed = [
    record.occasionId,
    record.placeId,
    ...record.listingIds,
  ].find((id) => idGenerator.parse(id) === null);
  if (malformed !== undefined) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Stored participation has malformed id: ${malformed}`,
    );
  }
  try {
    return Participation.reconstruct(record);
  } catch (error) {
    if (isRehydrationError(error)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Stored participation violates invariants",
        error,
      );
    }
    throw error;
  }
}

/** `ParticipationRepository` over the Lunt state object. */
export class DoParticipationRepository implements ParticipationRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toPage(
    page: Page<ParticipationRecord>,
  ): PaginationResult<Participation> {
    return {
      items: page.items.map((record) =>
        participationFromRecord(record, this.idGenerator),
      ),
      count: page.count,
    };
  }

  async insert(participation: Participation): Promise<void> {
    this.writes.push({
      kind: "occasion.insertParticipation",
      record: Participation.snapshot(participation),
    });
  }

  findById(key: ParticipationKey): Promise<Versioned<Participation> | null> {
    return mapDoError("Failed to find participation", async () => {
      const record = await this.client.query("occasion.findParticipation", {
        occasionId: key.occasionId,
        placeId: key.placeId,
      });
      if (record === null) return null;
      return {
        entity: participationFromRecord(record, this.idGenerator),
        expectedVersion: record.version as ExpectedVersion<Participation>,
      };
    });
  }

  async save(
    participation: Participation,
    expectedVersion: ExpectedVersion<Participation>,
  ): Promise<void> {
    this.writes.push({
      kind: "occasion.saveParticipation",
      record: Participation.snapshot(participation),
      expectedVersion,
    });
  }

  async delete(
    key: ParticipationKey,
    expectedVersion: ExpectedVersion<Participation>,
  ): Promise<void> {
    this.writes.push({
      kind: "occasion.deleteParticipation",
      key: { occasionId: key.occasionId, placeId: key.placeId },
      expectedVersion,
    });
  }

  findByOccasion(
    occasionId: OccasionId,
    pagination: Pagination,
  ): Promise<PaginationResult<Participation>> {
    return mapDoError(
      "Failed to list participations of an occasion",
      async () =>
        this.toPage(
          await this.client.query("occasion.findParticipationsByOccasion", {
            occasionId,
            page: pagination.page,
            limit: pagination.limit,
          }),
        ),
    );
  }

  findByPlace(
    placeId: PlaceId,
    pagination: Pagination,
  ): Promise<PaginationResult<Participation>> {
    return mapDoError("Failed to list participations of a place", async () =>
      this.toPage(
        await this.client.query("occasion.findParticipationsByPlace", {
          placeId,
          page: pagination.page,
          limit: pagination.limit,
        }),
      ),
    );
  }
}
