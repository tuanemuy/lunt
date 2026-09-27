import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { SqlCursor, SqlExec, SqlRow, TransactionRunner } from "../sql";

/**
 * Durable Object SQLite limits the Node stand-in reproduces, so a query
 * that would fail inside the real object fails in the fast suite too.
 */
export const DO_MAX_BOUND_PARAMETERS = 100;

const FORBIDDEN_STATEMENT =
  /^\s*(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

function assertBindable(value: unknown, index: number): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    value instanceof ArrayBuffer
  ) {
    return;
  }
  throw new TypeError(
    `SQL binding #${index + 1} has unsupported type ${
      value === undefined ? "undefined" : typeof value
    } (Durable Object SQLite accepts string, number, null, ArrayBuffer)`,
  );
}

function toDurableObjectValue(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    );
  }
  return value;
}

export type NodeSqlStorage = Readonly<{
  sql: SqlExec;
  transaction: TransactionRunner;
  close(): void;
}>;

/**
 * `node:sqlite` behind the structural `SqlExec` / `TransactionRunner`
 * subset of a Durable Object's `ctx.storage`, for running the DO's store
 * code in the Node test pool. Mirrors the platform's restrictions:
 * transaction-control statements are refused (use `transaction`), at
 * most 100 bound parameters, and only string / number / null /
 * ArrayBuffer bindings.
 */
export function createNodeSqlStorage(path = ":memory:"): NodeSqlStorage {
  const db = new DatabaseSync(path);
  const cache = new Map<string, StatementSync>();
  const totalChanges = db.prepare("SELECT total_changes() AS n");
  const changes = (): number => Number((totalChanges.get() as { n: number }).n);
  let depth = 0;

  const sql: SqlExec = {
    exec<T extends SqlRow = SqlRow>(
      query: string,
      ...bindings: unknown[]
    ): SqlCursor<T> {
      if (FORBIDDEN_STATEMENT.test(query)) {
        throw new Error(
          "To execute a transaction, please use the state.storage.transaction() or state.storage.transactionSync() APIs instead of the SQL BEGIN TRANSACTION or SAVEPOINT statements.",
        );
      }
      if (bindings.length > DO_MAX_BOUND_PARAMETERS) {
        throw new Error("too many SQL variables: SQLITE_ERROR");
      }
      bindings.forEach(assertBindable);
      let statement = cache.get(query);
      if (statement === undefined) {
        statement = db.prepare(query);
        cache.set(query, statement);
      }
      const before = changes();
      const rows = (
        statement.all(
          ...(bindings.map((value) =>
            value instanceof ArrayBuffer ? new Uint8Array(value) : value,
          ) as never[]),
        ) as Record<string, unknown>[]
      ).map((row) => {
        for (const key of Object.keys(row)) {
          row[key] = toDurableObjectValue(row[key]);
        }
        return row as T;
      });
      const rowsWritten = changes() - before;
      return { toArray: () => rows, rowsWritten };
    },
  };

  const transaction: TransactionRunner = (fn) => {
    const savepoint = `sp_${depth}`;
    db.exec(depth === 0 ? "BEGIN" : `SAVEPOINT ${savepoint}`);
    depth += 1;
    try {
      const result = fn();
      depth -= 1;
      db.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      depth -= 1;
      db.exec(
        depth === 0
          ? "ROLLBACK"
          : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`,
      );
      throw error;
    }
  };

  return { sql, transaction, close: () => db.close() };
}
