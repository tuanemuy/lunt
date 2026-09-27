import type { SqlExec, SqlRow, TransactionRunner } from "../sql";
import { ACCOUNT_MIGRATIONS } from "./account";
import { APPLICATION_MIGRATIONS } from "./application";
import { AUTHORITY_MIGRATIONS } from "./authority";
import { DEAD_LETTER_MIGRATION } from "./deadLetters";
import { DEV_MAILBOX_MIGRATIONS } from "./devMailbox";
import { NOTIFICATION_MIGRATIONS } from "./notification";

export type Migration = Readonly<{
  version: number;
  name: string;
  statements: readonly string[];
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
 * Each entry is applied exactly once, in order, inside its own
 * transaction, and recorded in `_schema_migrations`; an object applies
 * only versions above the highest it has recorded. Versions are allocated
 * globally: a new migration takes the next number above every existing
 * one, whichever domain it belongs to. Never edit an applied one — local
 * and deployed objects keep their data across code changes.
 *
 * Allocated: 1 core, 2 accounts, 3 dead letters, 4 login challenges,
 * 5 authority, 6 application, 7 notification, 8 development mailbox.
 */
export const MIGRATIONS: readonly Migration[] = [
  CORE_MIGRATION,
  ...ACCOUNT_MIGRATIONS,
  DEAD_LETTER_MIGRATION,
  ...AUTHORITY_MIGRATIONS,
  ...APPLICATION_MIGRATIONS,
  ...NOTIFICATION_MIGRATIONS,
  ...DEV_MAILBOX_MIGRATIONS,
].sort((a, b) => a.version - b.version);

const LEDGER_DDL = `CREATE TABLE IF NOT EXISTS _schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
)`;

/**
 * Brings the object's SQLite up to the latest migration. Synchronous, so
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
  const rows = sql
    .exec<{ version: number | null } & SqlRow>(
      "SELECT MAX(version) AS version FROM _schema_migrations",
    )
    .toArray();
  const current = Number(rows[0]?.version ?? 0);
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    transaction(() => {
      for (const statement of migration.statements) {
        sql.exec(statement);
      }
      sql.exec(
        "INSERT INTO _schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        migration.version,
        migration.name,
        now.getTime(),
      );
    });
  }
}
