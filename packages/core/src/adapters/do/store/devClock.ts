import type { DevClockAdvance } from "../protocol/devClock";
import type { SqlExec, SqlRow } from "../sql";
import type { Migration } from "./schema";

/**
 * The development clock (F-06): how far the application's time runs ahead
 * of the wall clock, for manual tests that need time to pass. Read and
 * advanced outside any unit of work; honoured only while the development
 * tools are on (`application/di/clock.ts`).
 */
export const DEV_CLOCK_MIGRATIONS: readonly Migration[] = [
  {
    version: 9,
    name: "development clock",
    statements: [
      `CREATE TABLE dev_clock (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        offset_ms INTEGER NOT NULL
      )`,
    ],
  },
];

/** Upper bound of one advance: ten years. */
export const MAX_DEV_CLOCK_STEP_MS = 10 * 366 * 24 * 60 * 60 * 1000;

export function readDevClockOffset(sql: SqlExec): number {
  const row = sql
    .exec<{ offset_ms: number } & SqlRow>(
      "SELECT offset_ms FROM dev_clock WHERE id = 1",
    )
    .toArray()[0];
  return row === undefined ? 0 : Number(row.offset_ms);
}

/**
 * Moves the development clock forward by `ms` and returns the new offset.
 * Time never goes back: `ms` must be a positive whole number of
 * milliseconds, ten years at most.
 */
export function advanceDevClock(sql: SqlExec, ms: number): DevClockAdvance {
  if (!Number.isInteger(ms) || ms <= 0 || ms > MAX_DEV_CLOCK_STEP_MS) {
    return {
      kind: "refused",
      reason: `The development clock only moves forward, by 1 ms to ten years (got ${ms})`,
    };
  }
  const next = readDevClockOffset(sql) + ms;
  sql.exec(
    `INSERT INTO dev_clock (id, offset_ms) VALUES (1, ?)
       ON CONFLICT (id) DO UPDATE SET offset_ms = excluded.offset_ms`,
    next,
  );
  return { kind: "advanced", offsetMs: next };
}
