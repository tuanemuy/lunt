import { StewardedTargetOrder } from "@repo/core/domain/authority/stewardedTarget";
import { StewardedRef } from "@repo/core/domain/common/refs";
import type {
  AuthorityCommand,
  AuthorityCondition,
  AuthorityQueries,
  RoleRosterRecord,
  StewardshipRecord,
  TargetRecord,
} from "../protocol/authority";
import type { CommandOutcome } from "../protocol/commands";
import type { SqlExec, SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import type { ConditionHandlersOf } from "./conditions";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import {
  describeStewardedTargets,
  STEWARDED_TARGET_LOOKUPS,
} from "./stewardedTargetLookups";
import { insertUnique, updateVersioned } from "./versioned";

const AUTHORITY_TABLES_MIGRATION: Migration = {
  version: 5,
  name: "stewardships and role rosters",
  statements: [
    // One row per target; `kind` and `id` together are the key. Stewards
    // and pending invitations are the aggregate snapshot as JSON (dates as
    // epoch ms).
    `CREATE TABLE stewardships (
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      status TEXT NOT NULL,
      stewards TEXT NOT NULL,
      invitations TEXT NOT NULL,
      version INTEGER NOT NULL,
      PRIMARY KEY (target_kind, target_id)
    )`,
    // Reverse index of stewards, rebuilt from the snapshot on every write.
    // `kind_rank` orders place, region, occasion for `findPageBySteward`.
    `CREATE TABLE stewardship_stewards (
      account_id TEXT NOT NULL,
      kind_rank INTEGER NOT NULL,
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      PRIMARY KEY (account_id, kind_rank, target_id)
    )`,
    `CREATE INDEX idx_stewardship_stewards_target
       ON stewardship_stewards (target_kind, target_id)`,
    // One row per role, keyed by the role; `status` is null for editors.
    `CREATE TABLE role_rosters (
      role TEXT PRIMARY KEY,
      status TEXT,
      holders TEXT NOT NULL,
      version INTEGER NOT NULL
    )`,
    // Reverse index of holders for `findRolesOf`, rebuilt on every save.
    `CREATE TABLE role_holders (
      account_id TEXT NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY (account_id, role)
    )`,
  ],
};

/**
 * Authority's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Authority starts at 5; take the next free number
 * across all domains for any later migration.
 */
export const AUTHORITY_MIGRATIONS: readonly Migration[] = [
  AUTHORITY_TABLES_MIGRATION,
];

type StewardshipRow = Readonly<{
  target_kind: string;
  target_id: string;
  status: string;
  stewards: string;
  invitations: string;
  version: number;
}> &
  SqlRow;

type RoleRosterRow = Readonly<{
  role: string;
  status: string | null;
  holders: string;
  version: number;
}> &
  SqlRow;

type StoredMember = Readonly<{ accountId: string; since: number }>;
type StoredInvitation = Readonly<{
  id: string;
  email: string;
  invitedAt: number;
}>;

const STEWARDSHIP_COLUMNS =
  "s.target_kind, s.target_id, s.status, s.stewards, s.invitations, s.version";

const toStewardshipRecord = (row: StewardshipRow): StewardshipRecord => ({
  target: { kind: row.target_kind, id: row.target_id },
  status: row.status,
  stewards: (JSON.parse(row.stewards) as StoredMember[]).map((steward) => ({
    accountId: steward.accountId,
    since: new Date(steward.since),
  })),
  invitations: (JSON.parse(row.invitations) as StoredInvitation[]).map(
    (invitation) => ({
      id: invitation.id,
      email: invitation.email,
      invitedAt: new Date(invitation.invitedAt),
    }),
  ),
  version: Number(row.version),
});

const toRoleRosterRecord = (row: RoleRosterRow): RoleRosterRecord => ({
  role: row.role,
  status: row.status,
  holders: (JSON.parse(row.holders) as StoredMember[]).map((holder) => ({
    accountId: holder.accountId,
    since: new Date(holder.since),
  })),
  version: Number(row.version),
});

const stewardshipValues = (record: StewardshipRecord) => ({
  status: record.status,
  stewards: JSON.stringify(
    record.stewards.map(
      (steward): StoredMember => ({
        accountId: steward.accountId,
        since: steward.since.getTime(),
      }),
    ),
  ),
  invitations: JSON.stringify(
    record.invitations.map(
      (invitation): StoredInvitation => ({
        id: invitation.id,
        email: invitation.email,
        invitedAt: invitation.invitedAt.getTime(),
      }),
    ),
  ),
  version: record.version,
});

const describeTarget = (target: TargetRecord): string =>
  `Stewardship of ${target.kind}:${target.id}`;

function kindRank(kind: string): number {
  if (!StewardedRef.isKind(kind)) {
    throw new Error(`Unknown stewarded target kind: ${kind}`);
  }
  return StewardedTargetOrder.rank(kind);
}

function indexStewards(sql: SqlExec, record: StewardshipRecord): void {
  const { kind, id } = record.target;
  sql.exec(
    "DELETE FROM stewardship_stewards WHERE target_kind = ? AND target_id = ?",
    kind,
    id,
  );
  if (record.stewards.length === 0) return;
  sql.exec(
    `INSERT INTO stewardship_stewards (account_id, kind_rank, target_kind, target_id)
       SELECT value, ?, ?, ? FROM json_each(?)`,
    kindRank(kind),
    kind,
    id,
    JSON.stringify(record.stewards.map((steward) => steward.accountId)),
  );
}

function indexHolders(sql: SqlExec, record: RoleRosterRecord): void {
  sql.exec("DELETE FROM role_holders WHERE role = ?", record.role);
  if (record.holders.length === 0) return;
  sql.exec(
    `INSERT INTO role_holders (account_id, role)
       SELECT value, ? FROM json_each(?)`,
    record.role,
    JSON.stringify(record.holders.map((holder) => holder.accountId)),
  );
}

const rosterValues = (record: RoleRosterRecord) => ({
  status: record.status,
  holders: JSON.stringify(
    record.holders.map(
      (holder): StoredMember => ({
        accountId: holder.accountId,
        since: holder.since.getTime(),
      }),
    ),
  ),
  version: record.version,
});

function afterApplied(
  outcome: CommandOutcome,
  index: () => void,
): CommandOutcome {
  if (outcome.kind === "applied") index();
  return outcome;
}

export const authorityQueryHandlers: QueryHandlersOf<AuthorityQueries> = {
  "authority.findStewardship": (sql, { target }) => {
    const row = sql
      .exec<StewardshipRow>(
        `SELECT ${STEWARDSHIP_COLUMNS} FROM stewardships s
           WHERE s.target_kind = ? AND s.target_id = ?`,
        target.kind,
        target.id,
      )
      .toArray()[0];
    return row ? toStewardshipRecord(row) : null;
  },
  "authority.findStewardshipsByTargets": (sql, { targets }) => {
    if (targets.length === 0) return [];
    return sql
      .exec<StewardshipRow>(
        `SELECT DISTINCT ${STEWARDSHIP_COLUMNS}
           FROM json_each(?) j
           JOIN stewardships s
             ON s.target_kind = json_extract(j.value, '$.kind')
            AND s.target_id = json_extract(j.value, '$.id')`,
        JSON.stringify(targets.map(({ kind, id }) => ({ kind, id }))),
      )
      .toArray()
      .map(toStewardshipRecord);
  },
  "authority.findStewardshipPageBySteward": (
    sql,
    { accountId, page, limit },
  ) => {
    const items = sql
      .exec<StewardshipRow>(
        `SELECT ${STEWARDSHIP_COLUMNS}
           FROM stewardship_stewards i
           JOIN stewardships s
             ON s.target_kind = i.target_kind AND s.target_id = i.target_id
           WHERE i.account_id = ?
           ORDER BY i.kind_rank, i.target_id
           LIMIT ? OFFSET ?`,
        accountId,
        limit,
        (page - 1) * limit,
      )
      .toArray()
      .map(toStewardshipRecord);
    const count = sql
      .exec<{ n: number } & SqlRow>(
        "SELECT COUNT(*) AS n FROM stewardship_stewards WHERE account_id = ?",
        accountId,
      )
      .toArray()[0];
    return { items, count: Number(count?.n ?? 0) };
  },
  "authority.findRoleRoster": (sql, { role }) => {
    const row = sql
      .exec<RoleRosterRow>(
        "SELECT role, status, holders, version FROM role_rosters WHERE role = ?",
        role,
      )
      .toArray()[0];
    return row ? toRoleRosterRecord(row) : null;
  },
  "authority.findRolesOf": (sql, { accountId }) =>
    sql
      .exec<{ role: string } & SqlRow>(
        "SELECT role FROM role_holders WHERE account_id = ? ORDER BY role",
        accountId,
      )
      .toArray()
      .map((row) => row.role),
  "authority.describeTargets": (sql, { targets }) =>
    describeStewardedTargets(sql, targets, STEWARDED_TARGET_LOOKUPS),
};

export const authorityCommandHandlers: CommandHandlersOf<AuthorityCommand> = {
  "authority.insertStewardship": (sql, { record }) =>
    afterApplied(
      insertUnique(
        sql,
        "stewardships",
        {
          target_kind: record.target.kind,
          target_id: record.target.id,
          ...stewardshipValues(record),
        },
        describeTarget(record.target),
      ),
      () => indexStewards(sql, record),
    ),
  "authority.saveStewardship": (sql, { record, expectedVersion }) =>
    afterApplied(
      updateVersioned(
        sql,
        "stewardships",
        { target_kind: record.target.kind, target_id: record.target.id },
        stewardshipValues(record),
        expectedVersion,
        describeTarget(record.target),
      ),
      () => indexStewards(sql, record),
    ),
  "authority.saveRoleRoster": (sql, { record, expectedVersion }) =>
    afterApplied(
      expectedVersion === null
        ? insertUnique(
            sql,
            "role_rosters",
            { role: record.role, ...rosterValues(record) },
            `Role roster ${record.role}`,
          )
        : updateVersioned(
            sql,
            "role_rosters",
            { role: record.role },
            rosterValues(record),
            expectedVersion,
            `Role roster ${record.role}`,
          ),
      () => indexHolders(sql, record),
    ),
};

function hasSteward(
  sql: SqlExec,
  target: Readonly<{ kind: string; id: string }>,
): boolean {
  return (
    sql
      .exec(
        `SELECT 1 AS ok FROM stewardship_stewards
           WHERE target_kind = ? AND target_id = ? LIMIT 1`,
        target.kind,
        target.id,
      )
      .toArray().length > 0
  );
}

export const authorityConditionHandlers: ConditionHandlersOf<AuthorityCondition> =
  {
    "authority.holdsRole": (sql, { accountId, role }) =>
      sql
        .exec(
          "SELECT 1 AS ok FROM role_holders WHERE account_id = ? AND role = ?",
          accountId,
          role,
        )
        .toArray().length > 0,
    "authority.stewards": (sql, { accountId, target }) =>
      sql
        .exec(
          `SELECT 1 AS ok FROM stewardship_stewards
             WHERE account_id = ? AND target_kind = ? AND target_id = ?`,
          accountId,
          target.kind,
          target.id,
        )
        .toArray().length > 0,
    "authority.vacant": (sql, { target }) => !hasSteward(sql, target),
    "authority.staffed": (sql, { target }) => hasSteward(sql, target),
  };
