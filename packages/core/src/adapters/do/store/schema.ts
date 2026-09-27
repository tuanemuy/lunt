import type { SqlExec, SqlRow, TransactionRunner } from "../sql";
import { ACCOUNT_MIGRATION } from "./account";

export type Migration = Readonly<{
  version: number;
  name: string;
  statements: readonly string[];
}>;

/**
 * Versioned DDL for the Lunt state Durable Object. Each entry is applied
 * exactly once, in order, inside its own transaction, and recorded in
 * `_schema_migrations`. Append new entries; never edit an applied one —
 * local and deployed objects keep their data across code changes.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
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
      // Pending slice for the alarm relay; quarantined rows
      // (`failed_at IS NOT NULL`) are excluded so a poison row stops
      // polluting the hot path.
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
  },
  ACCOUNT_MIGRATION,
];

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
