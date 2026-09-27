import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { StewardshipRepository } from "@repo/core/domain/authority/ports/stewardshipRepository";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { AccountId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import { mapDoError } from "../helpers";
import type { StewardshipRecord } from "../protocol/authority";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";

/**
 * `StewardshipRepository` over the Lunt state object. Reads query the
 * object immediately; writes append commands to the unit of work's buffer,
 * which the object applies — with the per-target uniqueness and
 * optimistic-lock checks, and the stewards' reverse index — at commit.
 */
export class DoStewardshipRepository implements StewardshipRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toStewardship(record: StewardshipRecord): Stewardship {
    const ids = [
      record.target.id,
      ...record.stewards.map((steward) => steward.accountId),
      ...record.invitations.map((invitation) => invitation.id),
    ];
    const malformed = ids.find((id) => this.idGenerator.parse(id) === null);
    if (malformed !== undefined) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored stewardship has malformed id: ${malformed}`,
      );
    }
    try {
      return Stewardship.reconstruct(record);
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored stewardship violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(record: StewardshipRecord): Versioned<Stewardship> {
    return {
      entity: this.toStewardship(record),
      expectedVersion: record.version as ExpectedVersion<Stewardship>,
    };
  }

  private static toRecord(stewardship: Stewardship): StewardshipRecord {
    return {
      target: { kind: stewardship.target.kind, id: stewardship.target.id },
      status: stewardship.status,
      stewards: Stewardship.stewards(stewardship).map((steward) => ({
        accountId: steward.accountId,
        since: steward.since,
      })),
      invitations: stewardship.invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        invitedAt: invitation.invitedAt,
      })),
      version: stewardship.version,
    };
  }

  findById(target: StewardedRef): Promise<Versioned<Stewardship> | null> {
    return mapDoError("Failed to find stewardship", async () => {
      const record = await this.client.query("authority.findStewardship", {
        target: { kind: target.kind, id: target.id },
      });
      return record === null ? null : this.toVersioned(record);
    });
  }

  async findByTargets(
    targets: readonly StewardedRef[],
  ): Promise<readonly Stewardship[]> {
    IdBatch.assertWithinLimit(targets);
    if (targets.length === 0) return [];
    return mapDoError("Failed to find stewardships", async () => {
      const records = await this.client.query(
        "authority.findStewardshipsByTargets",
        { targets: targets.map(({ kind, id }) => ({ kind, id })) },
      );
      return records.map((record) => this.toStewardship(record));
    });
  }

  findPageBySteward(
    accountId: AccountId,
    pagination: Pagination,
  ): Promise<PaginationResult<Versioned<Stewardship>>> {
    return mapDoError("Failed to list stewardships", async () => {
      const page = await this.client.query(
        "authority.findStewardshipPageBySteward",
        { accountId, page: pagination.page, limit: pagination.limit },
      );
      return {
        items: page.items.map((record) => this.toVersioned(record)),
        count: page.count,
      };
    });
  }

  async insert(stewardship: Stewardship): Promise<void> {
    this.writes.push({
      kind: "authority.insertStewardship",
      record: DoStewardshipRepository.toRecord(stewardship),
    });
  }

  async save(
    stewardship: Stewardship,
    expectedVersion: ExpectedVersion<Stewardship>,
  ): Promise<void> {
    this.writes.push({
      kind: "authority.saveStewardship",
      record: DoStewardshipRepository.toRecord(stewardship),
      expectedVersion,
    });
  }
}
