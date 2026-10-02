import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { TakedownClaimId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import type { TakedownClaimRepository } from "@repo/core/domain/moderation/ports/takedownClaimRepository";
import {
  type OpenTakedownClaim,
  TakedownClaim,
} from "@repo/core/domain/moderation/takedownClaim";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { TakedownClaimRecord } from "../protocol/moderation";

/**
 * `TakedownClaimRepository` over the Lunt state object. Reads query the
 * object immediately; writes append commands the object applies — with the
 * id-uniqueness and optimistic-lock checks — when the unit of work commits.
 */
export class DoTakedownClaimRepository implements TakedownClaimRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toClaim(record: TakedownClaimRecord): TakedownClaim {
    const photoIds: unknown = record.photoIds;
    if (!Array.isArray(photoIds)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored takedown claim ${record.id} has malformed photo ids`,
      );
    }
    const malformed = [record.id, record.target.id, ...photoIds].find(
      (id: unknown) =>
        typeof id !== "string" || this.idGenerator.parse(id) === null,
    );
    if (malformed !== undefined) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored takedown claim has malformed id: ${String(malformed)}`,
      );
    }
    try {
      return TakedownClaim.reconstruct({
        ...record,
        receivedAt: new Date(record.receivedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored takedown claim violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  static toRecord(claim: TakedownClaim): TakedownClaimRecord {
    const snapshot = TakedownClaim.snapshot(claim);
    return { ...snapshot, receivedAt: snapshot.receivedAt.getTime() };
  }

  findById(id: TakedownClaimId): Promise<Versioned<TakedownClaim> | null> {
    return mapDoError("Failed to find takedown claim", async () => {
      const record = await this.client.query("moderation.findTakedownClaim", {
        id,
      });
      return record === null
        ? null
        : {
            entity: this.toClaim(record),
            expectedVersion: record.version as ExpectedVersion<TakedownClaim>,
          };
    });
  }

  findOpen(
    pagination: Pagination,
  ): Promise<PaginationResult<OpenTakedownClaim>> {
    return mapDoError("Failed to find open takedown claims", async () => {
      const result = await this.client.query(
        "moderation.findOpenTakedownClaims",
        { page: pagination.page, limit: pagination.limit },
      );
      return {
        items: result.items.map((record) => {
          const claim = this.toClaim(record);
          if (claim.status !== "open") {
            throw new SystemError(
              SystemErrorCode.DataIntegrityError,
              `Takedown claim ${claim.id} is not open`,
            );
          }
          return claim;
        }),
        count: result.count,
      };
    });
  }

  async insert(claim: TakedownClaim): Promise<void> {
    this.writes.push({
      kind: "moderation.insertTakedownClaim",
      record: DoTakedownClaimRepository.toRecord(claim),
    });
  }

  async save(
    claim: TakedownClaim,
    expectedVersion: ExpectedVersion<TakedownClaim>,
  ): Promise<void> {
    this.writes.push({
      kind: "moderation.saveTakedownClaim",
      record: DoTakedownClaimRepository.toRecord(claim),
      expectedVersion,
    });
  }
}
