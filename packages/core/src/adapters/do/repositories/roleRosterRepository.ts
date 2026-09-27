import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { RoleRosterRepository } from "@repo/core/domain/authority/ports/roleRosterRepository";
import { Role } from "@repo/core/domain/authority/role";
import {
  RoleRoster,
  type RosterOf,
} from "@repo/core/domain/authority/roleRoster";
import type { AccountId } from "@repo/core/domain/common/ids";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import { mapDoError } from "../helpers";
import type { RoleRosterRecord } from "../protocol/authority";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";

/**
 * The `expectedVersion` `find` hands out while nothing is stored for the
 * role. Stored versions are never negative, so it cannot match one; `save`
 * turns it into a save-if-absent.
 */
const UNSAVED = -1 as ExpectedVersion<RoleRoster>;

/**
 * `RoleRosterRepository` over the Lunt state object: one row per role,
 * plus a reverse index of holders for `findRolesOf`. Writes buffer in the
 * unit of work and apply at commit.
 */
export class DoRoleRosterRepository implements RoleRosterRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toRoster(record: RoleRosterRecord): RoleRoster {
    const malformed = record.holders.find(
      (holder) => this.idGenerator.parse(holder.accountId) === null,
    );
    if (malformed !== undefined) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored role roster has malformed account id: ${malformed.accountId}`,
      );
    }
    try {
      return RoleRoster.reconstruct(record);
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored role roster violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private static toRecord(roster: RoleRoster): RoleRosterRecord {
    return {
      role: roster.role,
      status: roster.role === "operator" ? roster.status : null,
      holders: RoleRoster.holders(roster).map((holder) => ({
        accountId: holder.accountId,
        since: holder.since,
      })),
      version: roster.version,
    };
  }

  find<R extends Role>(role: R): Promise<Versioned<RosterOf<R>>> {
    return mapDoError("Failed to find role roster", async () => {
      const record = await this.client.query("authority.findRoleRoster", {
        role,
      });
      if (record === null) {
        return {
          entity: RoleRoster.initial(role),
          expectedVersion: UNSAVED as ExpectedVersion<RosterOf<R>>,
        };
      }
      const roster = this.toRoster(record);
      if (roster.role !== role) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          `Stored roster of ${role} holds ${roster.role}`,
        );
      }
      return {
        entity: roster as RosterOf<R>,
        expectedVersion: record.version as ExpectedVersion<RosterOf<R>>,
      };
    });
  }

  async save(
    roster: RoleRoster,
    expectedVersion: ExpectedVersion<RoleRoster>,
  ): Promise<void> {
    this.writes.push({
      kind: "authority.saveRoleRoster",
      record: DoRoleRosterRepository.toRecord(roster),
      expectedVersion: expectedVersion === UNSAVED ? null : expectedVersion,
    });
  }

  findRolesOf(accountId: AccountId): Promise<ReadonlySet<Role>> {
    return mapDoError("Failed to find roles", async () => {
      const roles = await this.client.query("authority.findRolesOf", {
        accountId,
      });
      return new Set(roles.filter(Role.is));
    });
  }
}
