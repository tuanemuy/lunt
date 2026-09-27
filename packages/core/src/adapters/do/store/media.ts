import type {
  MediaCommand,
  MediaQueries,
  PhotoAssetRecord,
} from "../protocol/media";
import type { SqlExec, SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import {
  APPLIED,
  deleteVersioned,
  insertUnique,
  updateVersioned,
} from "./versioned";

const PHOTO_ASSET_TABLES_MIGRATION: Migration = {
  version: 10,
  name: "photo assets",
  statements: [
    `CREATE TABLE photo_assets (
      id TEXT PRIMARY KEY,
      registered_by TEXT NOT NULL,
      consented_at INTEGER NOT NULL,
      digest TEXT NOT NULL,
      registered_at INTEGER NOT NULL,
      stage TEXT NOT NULL,
      owner_kind TEXT,
      owner_id TEXT,
      version INTEGER NOT NULL
    )`,
    // The sweep reads unowned photos oldest first; owned ones never qualify.
    `CREATE INDEX idx_photo_assets_unowned
       ON photo_assets (registered_at, id) WHERE owner_kind IS NULL`,
    // Ids of deleted photos. The port refuses to insert one again, so a
    // resent registration cannot bring a deleted photo back.
    "CREATE TABLE photo_asset_tombstones (id TEXT PRIMARY KEY)",
  ],
};

/**
 * Media's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Media has 10; take the next free number across all
 * domains for any later migration.
 */
export const MEDIA_MIGRATIONS: readonly Migration[] = [
  PHOTO_ASSET_TABLES_MIGRATION,
];

type PhotoAssetRow = Readonly<{
  id: string;
  registered_by: string;
  consented_at: number;
  digest: string;
  registered_at: number;
  stage: string;
  owner_kind: string | null;
  owner_id: string | null;
  version: number;
}> &
  SqlRow;

const COLUMNS = `id, registered_by, consented_at, digest, registered_at,
  stage, owner_kind, owner_id, version`;

// Stage and owner kind pass through unchecked: the request side's
// `PhotoAsset.reconstruct` rejects unknown ones as data-integrity failures.
const toRecord = (row: PhotoAssetRow): PhotoAssetRecord => ({
  id: row.id,
  registeredBy: row.registered_by,
  consentedAt: Number(row.consented_at),
  digest: row.digest,
  registeredAt: Number(row.registered_at),
  stage: row.stage,
  owner:
    row.owner_kind === null || row.owner_id === null
      ? null
      : { kind: row.owner_kind, id: row.owner_id },
  version: Number(row.version),
});

const values = (record: PhotoAssetRecord) => ({
  registered_by: record.registeredBy,
  consented_at: record.consentedAt,
  digest: record.digest,
  registered_at: record.registeredAt,
  stage: record.stage,
  owner_kind: record.owner?.kind ?? null,
  owner_id: record.owner?.id ?? null,
  version: record.version,
});

const SWEEPABLE = `FROM photo_assets
  WHERE owner_kind IS NULL AND (stage = 'discarded' OR registered_at < ?)`;

const isTombstoned = (sql: SqlExec, id: string): boolean =>
  sql
    .exec("SELECT 1 AS ok FROM photo_asset_tombstones WHERE id = ?", id)
    .toArray().length > 0;

export const mediaQueryHandlers: QueryHandlersOf<MediaQueries> = {
  "media.photo.findById": (sql, { id }) => {
    const row = sql
      .exec<PhotoAssetRow>(
        `SELECT ${COLUMNS} FROM photo_assets WHERE id = ?`,
        id,
      )
      .toArray()[0];
    return row ? toRecord(row) : null;
  },
  "media.photo.findByIds": (sql, { ids }) => {
    if (ids.length === 0) return [];
    return sql
      .exec<PhotoAssetRow>(
        `SELECT ${COLUMNS} FROM photo_assets
           WHERE id IN (SELECT value FROM json_each(?))
           ORDER BY id`,
        JSON.stringify(ids),
      )
      .toArray()
      .map(toRecord);
  },
  "media.photo.findPageSweepable": (sql, { registeredBefore, page, limit }) => {
    const items = sql
      .exec<PhotoAssetRow>(
        `SELECT ${COLUMNS} ${SWEEPABLE}
           ORDER BY registered_at, id
           LIMIT ? OFFSET ?`,
        registeredBefore,
        limit,
        (page - 1) * limit,
      )
      .toArray()
      .map(toRecord);
    const count = sql
      .exec<{ n: number } & SqlRow>(
        `SELECT COUNT(*) AS n ${SWEEPABLE}`,
        registeredBefore,
      )
      .toArray()[0];
    return { items, count: Number(count?.n ?? 0) };
  },
};

export const mediaCommandHandlers: CommandHandlersOf<MediaCommand> = {
  "media.photo.insert": (sql, { record }) => {
    if (isTombstoned(sql, record.id)) {
      return {
        kind: "conflict",
        code: "UNIQUE_VIOLATION",
        message: `Photo ${record.id} was deleted; its id cannot be reused`,
      };
    }
    return insertUnique(
      sql,
      "photo_assets",
      { id: record.id, ...values(record) },
      `Photo ${record.id}`,
    );
  },
  "media.photo.save": (sql, { record, expectedVersion }) =>
    updateVersioned(
      sql,
      "photo_assets",
      { id: record.id },
      values(record),
      expectedVersion,
      `Photo ${record.id}`,
    ),
  "media.photo.delete": (sql, { id, expectedVersion }) => {
    const outcome = deleteVersioned(
      sql,
      "photo_assets",
      { id },
      expectedVersion,
      `Photo ${id}`,
    );
    if (outcome.kind !== "applied") return outcome;
    sql.exec(
      "INSERT INTO photo_asset_tombstones (id) VALUES (?) ON CONFLICT DO NOTHING",
      id,
    );
    return APPLIED;
  },
};
