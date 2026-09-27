import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { describe, expect, it } from "vitest";
import type { WriteCommand } from "../protocol/commands";
import { applyMigrations, MIGRATIONS } from "../store/schema";
import { createStateStore } from "../store/stateStore";
import { createNodeSqlStorage } from "../testing/nodeSqlStorage";

const NOW = new Date("2026-09-28T00:00:00.000Z");

function freshStore() {
  const storage = createNodeSqlStorage();
  applyMigrations(storage.sql, storage.transaction, NOW);
  return { storage, store: createStateStore(storage.sql, storage.transaction) };
}

const ids = new FakeIdGenerator();

function insertAccount(email: string): WriteCommand {
  return {
    kind: "account.insert",
    record: { id: ids.next(), email, version: 0 },
  };
}

describe("schema migrations", () => {
  it("are numbered strictly upwards", () => {
    const versions = MIGRATIONS.map((migration) => migration.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("apply each migration once, however often the object starts", () => {
    const storage = createNodeSqlStorage();
    applyMigrations(storage.sql, storage.transaction, NOW);
    applyMigrations(storage.sql, storage.transaction, NOW);
    const rows = storage.sql
      .exec<{ version: number }>(
        "SELECT version FROM _schema_migrations ORDER BY version",
      )
      .toArray();
    expect(rows.map((row) => row.version)).toEqual(
      MIGRATIONS.map((migration) => migration.version),
    );
  });

  it("apply only the migrations not yet recorded", () => {
    const storage = createNodeSqlStorage();
    const [first] = MIGRATIONS;
    if (first === undefined) throw new Error("no migrations");
    applyMigrations(storage.sql, storage.transaction, NOW, [first]);
    applyMigrations(storage.sql, storage.transaction, NOW);
    const count = storage.sql
      .exec<{ n: number }>("SELECT count(*) AS n FROM _schema_migrations")
      .toArray()[0]?.n;
    expect(count).toBe(MIGRATIONS.length);
  });

  it("apply a lower version that lands after a higher one was applied", () => {
    const storage = createNodeSqlStorage();
    const early = MIGRATIONS.filter((migration) => migration.version !== 4);
    applyMigrations(storage.sql, storage.transaction, NOW, early);
    applyMigrations(storage.sql, storage.transaction, NOW);
    const versions = storage.sql
      .exec<{ version: number }>(
        "SELECT version FROM _schema_migrations ORDER BY version",
      )
      .toArray()
      .map((row) => row.version);
    expect(versions).toEqual(MIGRATIONS.map((migration) => migration.version));
  });
});

describe("StateStore.commit", () => {
  it("names the first command that failed and keeps nothing of the unit of work", () => {
    const { storage, store } = freshStore();
    const taken = insertAccount("taken@example.com");
    expect(store.commit({ writes: [taken], events: [] }, NOW)).toEqual({
      kind: "committed",
    });

    const result = store.commit(
      {
        writes: [
          insertAccount("fresh@example.com"),
          insertAccount("taken@example.com"),
        ],
        events: [
          {
            id: ids.next(),
            type: "conformance.happened",
            payload: {},
            occurredAt: NOW,
            aggregateId: "x",
          },
        ],
      },
      NOW,
    );

    expect(result).toMatchObject({
      kind: "rejected",
      index: 1,
      failure: { kind: "conflict", code: "UNIQUE_VIOLATION" },
    });
    const accounts = storage.sql
      .exec<{ n: number }>("SELECT count(*) AS n FROM accounts")
      .toArray()[0]?.n;
    const events = storage.sql
      .exec<{ n: number }>("SELECT count(*) AS n FROM outbox_events")
      .toArray()[0]?.n;
    expect(accounts).toBe(1);
    expect(events).toBe(0);
  });

  it("tells a missing aggregate from a stale version", () => {
    const { store } = freshStore();
    const insert = insertAccount("a@example.com");
    if (insert.kind !== "account.insert") throw new Error("unexpected");
    store.commit({ writes: [insert], events: [] }, NOW);

    const stale = store.commit(
      {
        writes: [
          {
            kind: "account.save",
            record: { ...insert.record, version: 2 },
            expectedVersion: 1,
          },
        ],
        events: [],
      },
      NOW,
    );
    const missing = store.commit(
      {
        writes: [
          { kind: "account.delete", id: ids.next(), expectedVersion: 0 },
        ],
        events: [],
      },
      NOW,
    );

    expect(stale).toMatchObject({
      kind: "rejected",
      failure: { kind: "conflict", code: "OPTIMISTIC_LOCK_FAILURE" },
    });
    expect(missing).toMatchObject({
      kind: "rejected",
      failure: { kind: "notFound" },
    });
  });
});

describe("consumer receipts", () => {
  it("are recorded per consumer, idempotently, and pruned by age", () => {
    const { store } = freshStore();
    store.markConsumed("a", "e1", NOW);
    store.markConsumed("a", "e1", new Date(NOW.getTime() + 1000));
    store.markConsumed("b", "e2", new Date(NOW.getTime() + 10_000));

    expect(store.isConsumed("a", "e1")).toBe(true);
    expect(store.isConsumed("b", "e1")).toBe(false);
    expect(store.pruneReceipts(new Date(NOW.getTime() + 5_000))).toEqual({
      deleted: 1,
    });
    expect(store.isConsumed("a", "e1")).toBe(false);
    expect(store.isConsumed("b", "e2")).toBe(true);
  });
});

describe("node:sqlite stand-in", () => {
  it("refuses what Durable Object SQLite refuses", () => {
    const { sql } = createNodeSqlStorage();
    expect(() => sql.exec("BEGIN")).toThrow("transaction");
    expect(() => sql.exec("SAVEPOINT x")).toThrow("transaction");
    const params = Array.from({ length: 101 }, (_, i) => i);
    expect(() =>
      sql.exec(
        `SELECT 1 WHERE 1 IN (${params.map(() => "?").join(",")})`,
        ...params,
      ),
    ).toThrow("too many SQL variables");
    expect(() => sql.exec("SELECT ?", true)).toThrow("unsupported type");
    expect(() => sql.exec("SELECT ?", new Date())).toThrow("unsupported type");
  });

  it("rolls a failed transaction back", () => {
    const { sql, transaction } = createNodeSqlStorage();
    sql.exec("CREATE TABLE t (v INTEGER)");
    expect(() =>
      transaction(() => {
        sql.exec("INSERT INTO t VALUES (1)");
        throw new Error("abort");
      }),
    ).toThrow("abort");
    expect(sql.exec("SELECT count(*) AS n FROM t").toArray()[0]?.n).toBe(0);
  });
});
