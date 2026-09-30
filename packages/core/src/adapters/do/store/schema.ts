import type { SqlExec, SqlRow, TransactionRunner } from "../sql";
import { ACCOUNT_MIGRATIONS } from "./account";
import { APPLICATION_MIGRATIONS } from "./application";
import { AREA_MIGRATIONS } from "./area";
import { ARTICLE_MIGRATIONS } from "./article";
import { AUTHORITY_MIGRATIONS } from "./authority";
import { BOOKMARK_MIGRATIONS } from "./bookmark";
import { DEAD_LETTER_MIGRATION } from "./deadLetters";
import { DEV_CLOCK_MIGRATIONS } from "./devClock";
import { DEV_MAILBOX_MIGRATIONS } from "./devMailbox";
import { DISCOVERY_MIGRATIONS } from "./discovery";
import { LISTING_MIGRATIONS } from "./listing";
import { MEDIA_MIGRATIONS } from "./media";
import { MODERATION_MIGRATIONS } from "./moderation";
import { NOTIFICATION_MIGRATIONS } from "./notification";
import { OCCASION_MIGRATIONS } from "./occasion";
import { PLACE_MIGRATIONS } from "./place";
import { REGION_MIGRATIONS } from "./region";

export type Migration = Readonly<{
  version: number;
  name: string;
  statements: readonly string[];
  /**
   * A synchronous step after the statements, in the same transaction, for
   * data only code can derive (e.g. a backfill through domain functions).
   */
  run?: (sql: SqlExec) => void;
}>;

const CORE_MIGRATION: Migration = {
  version: 1,
  name: "outbox and consumer receipts",
  statements: [
    `CREATE TABLE outbox_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        processed_at INTEGER,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_attempt_at INTEGER,
        failed_at INTEGER,
        claimed_at INTEGER,
        claimed_by TEXT
      )`,
    // Pending slice for the alarm relay. `failed_at` is no longer set
    // (the relay never gives up on a row); `kickRelay` requeues any row
    // an earlier version parked.
    `CREATE INDEX idx_outbox_pending
         ON outbox_events (next_attempt_at, created_at, id)
         WHERE processed_at IS NULL AND failed_at IS NULL`,
    `CREATE TABLE consumer_receipts (
        consumer TEXT NOT NULL,
        event_id TEXT NOT NULL,
        consumed_at INTEGER NOT NULL,
        PRIMARY KEY (consumer, event_id)
      )`,
    `CREATE INDEX idx_consumer_receipts_consumed_at
         ON consumer_receipts (consumed_at)`,
  ],
};

/**
 * Versioned DDL for the Lunt state Durable Object, ordered by version.
 * Each entry is applied exactly once, inside its own transaction, and
 * recorded in `_schema_migrations`; an object applies every version it
 * has not recorded, lowest first. Versions are allocated globally, and a
 * domain may reserve one before its migration lands (below), so a lower
 * version can arrive after a higher one is applied — a migration must
 * therefore depend only on versions below it. Never edit an applied one:
 * local and deployed objects keep their data across code changes.
 *
 * Allocated: 1 core, 2 accounts, 3 dead letters, 4 login challenges,
 * 5 authority, 6 application, 7 notification, 8 development mailbox,
 * 9 development clock, 10 media, 11 place, 12 listing, 13 discovery,
 * 14 moderation, 15 application (stage 2), 16 notification (stage 2),
 * 17 region, 18 occasion, 19 bookmark, 20 article, 21 discovery (search
 * texts).
 */
export const MIGRATIONS: readonly Migration[] = [
  CORE_MIGRATION,
  ...ACCOUNT_MIGRATIONS,
  DEAD_LETTER_MIGRATION,
  ...AUTHORITY_MIGRATIONS,
  ...APPLICATION_MIGRATIONS,
  ...NOTIFICATION_MIGRATIONS,
  ...DEV_MAILBOX_MIGRATIONS,
  ...DEV_CLOCK_MIGRATIONS,
  ...AREA_MIGRATIONS,
  ...MEDIA_MIGRATIONS,
  ...PLACE_MIGRATIONS,
  ...LISTING_MIGRATIONS,
  ...DISCOVERY_MIGRATIONS,
  ...MODERATION_MIGRATIONS,
  ...REGION_MIGRATIONS,
  ...OCCASION_MIGRATIONS,
  ...BOOKMARK_MIGRATIONS,
  ...ARTICLE_MIGRATIONS,
].sort((a, b) => a.version - b.version);

const LEDGER_DDL = `CREATE TABLE IF NOT EXISTS _schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
)`;

/**
 * Applies every migration the object has not recorded yet. Synchronous, so
 * running it from the DO constructor completes before any request is
 * delivered — no request can observe a half-migrated store.
 */
export function applyMigrations(
  sql: SqlExec,
  transaction: TransactionRunner,
  now: Date,
  migrations: readonly Migration[] = MIGRATIONS,
): void {
  sql.exec(LEDGER_DDL);
  const applied = new Set(
    sql
      .exec<{ version: number } & SqlRow>(
        "SELECT version FROM _schema_migrations",
      )
      .toArray()
      .map((row) => Number(row.version)),
  );
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    transaction(() => {
      for (const statement of migration.statements) {
        sql.exec(statement);
      }
      migration.run?.(sql);
      sql.exec(
        "INSERT INTO _schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        migration.version,
        migration.name,
        now.getTime(),
      );
    });
  }
}
