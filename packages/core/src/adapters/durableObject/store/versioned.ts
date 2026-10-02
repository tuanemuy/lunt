import type { CommandOutcome } from "../protocol/commands";
import type { SqlExec, SqlValue } from "../sql";

/**
 * Write primitives shared by every versioned aggregate table. Each
 * returns its outcome as data; `StateStore.commit` aborts the whole
 * transaction on the first non-`applied` outcome.
 *
 * Table and column names come from the store's own constants, never from
 * input, so interpolating them is safe.
 */

export const APPLIED: CommandOutcome = { kind: "applied" };

/**
 * `INSERT … ON CONFLICT DO NOTHING` refuses the row on any uniqueness
 * constraint of the table — the id or a port-guarded unique key — and
 * reports it as a `UNIQUE_VIOLATION` conflict instead of throwing.
 */
export function insertUnique(
  sql: SqlExec,
  table: string,
  row: Readonly<Record<string, SqlValue>>,
  describe: string,
): CommandOutcome {
  const columns = Object.keys(row);
  const inserted = sql
    .exec(
      `INSERT INTO ${table} (${columns.join(", ")})
         VALUES (${columns.map(() => "?").join(", ")})
         ON CONFLICT DO NOTHING RETURNING 1 AS ok`,
      ...columns.map((column) => row[column]),
    )
    .toArray();
  if (inserted.length === 0) {
    return {
      kind: "conflict",
      code: "UNIQUE_VIOLATION",
      message: `${describe} already exists`,
    };
  }
  return APPLIED;
}

function missingOrStale(
  sql: SqlExec,
  table: string,
  key: Readonly<Record<string, SqlValue>>,
  describe: string,
  expectedVersion: number,
): CommandOutcome {
  const columns = Object.keys(key);
  const exists =
    sql
      .exec(
        `SELECT 1 AS ok FROM ${table} WHERE ${columns
          .map((column) => `${column} = ?`)
          .join(" AND ")}`,
        ...columns.map((column) => key[column]),
      )
      .toArray().length > 0;
  if (!exists) {
    return {
      kind: "notFound",
      code: "NOT_FOUND",
      message: `${describe} does not exist`,
    };
  }
  return {
    kind: "conflict",
    code: "OPTIMISTIC_LOCK_FAILURE",
    message: `${describe} changed since version ${expectedVersion} was read`,
  };
}

/**
 * Optimistic-lock update: applies only when the stored `version` equals
 * `expectedVersion`. Otherwise tells a missing row (`notFound`) from a
 * stale version (`conflict`). A uniqueness violation of the new values
 * is a `UNIQUE_VIOLATION` conflict.
 */
export function updateVersioned(
  sql: SqlExec,
  table: string,
  key: Readonly<Record<string, SqlValue>>,
  values: Readonly<Record<string, SqlValue>>,
  expectedVersion: number,
  describe: string,
): CommandOutcome {
  const keyColumns = Object.keys(key);
  const valueColumns = Object.keys(values);
  let updated: readonly unknown[];
  try {
    updated = sql
      .exec(
        `UPDATE ${table} SET ${valueColumns
          .map((column) => `${column} = ?`)
          .join(", ")}
           WHERE ${keyColumns.map((column) => `${column} = ?`).join(" AND ")}
             AND version = ?
           RETURNING 1 AS ok`,
        ...valueColumns.map((column) => values[column]),
        ...keyColumns.map((column) => key[column]),
        expectedVersion,
      )
      .toArray();
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) {
      return {
        kind: "conflict",
        code: "UNIQUE_VIOLATION",
        message: `${describe} would duplicate a unique value`,
      };
    }
    throw error;
  }
  if (updated.length === 0) {
    return missingOrStale(sql, table, key, describe, expectedVersion);
  }
  return APPLIED;
}

/** Optimistic-lock delete with the same outcome split as `updateVersioned`. */
export function deleteVersioned(
  sql: SqlExec,
  table: string,
  key: Readonly<Record<string, SqlValue>>,
  expectedVersion: number,
  describe: string,
): CommandOutcome {
  const keyColumns = Object.keys(key);
  const deleted = sql
    .exec(
      `DELETE FROM ${table}
         WHERE ${keyColumns.map((column) => `${column} = ?`).join(" AND ")}
           AND version = ?
         RETURNING 1 AS ok`,
      ...keyColumns.map((column) => key[column]),
      expectedVersion,
    )
    .toArray();
  if (deleted.length === 0) {
    return missingOrStale(sql, table, key, describe, expectedVersion);
  }
  return APPLIED;
}
