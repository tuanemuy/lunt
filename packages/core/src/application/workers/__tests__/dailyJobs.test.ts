import type { RequestContainer } from "@repo/core/application/di/types";
import { describe, expect, it } from "vitest";
import { FakeLogger } from "../../__tests__/fakes/fakeLogger";
import { type DailyJob, drainPages, runDailyJobs } from "../dailyJobs";

const NOW = new Date("2026-09-28T15:05:00.000Z");

function containerWith(logger: FakeLogger): RequestContainer {
  return {
    clock: { now: () => NOW },
    logger,
  } as unknown as RequestContainer;
}

/** A query whose processed targets leave its results, like the jobs' queries. */
function pendingTargets(initial: readonly string[], pageSize = 2) {
  const remaining = [...initial];
  return {
    remaining,
    readPage: async (page: number) =>
      remaining.slice((page - 1) * pageSize, page * pageSize),
    done: (target: string) => {
      remaining.splice(remaining.indexOf(target), 1);
    },
  };
}

describe("drainPages", () => {
  it("processes every target by re-reading the first page until it is empty", async () => {
    const targets = pendingTargets(["a", "b", "c", "d", "e"]);
    const order: string[] = [];

    const report = await drainPages({
      job: "test",
      logger: new FakeLogger(),
      readPage: targets.readPage,
      keyOf: (t) => t,
      process: async (t) => {
        order.push(t);
        targets.done(t);
      },
    });

    expect(order).toEqual(["a", "b", "c", "d", "e"]);
    expect(report).toEqual({
      processed: 5,
      failed: 0,
      skipped: 0,
      abandoned: false,
    });
  });

  it("does not stop on a failure: the targets behind a failing one are processed", async () => {
    const targets = pendingTargets(
      ["a", "bad1", "b", "c", "bad2", "d", "e"],
      3,
    );
    const logger = new FakeLogger();

    const report = await drainPages({
      job: "test",
      logger,
      readPage: targets.readPage,
      keyOf: (t) => t,
      process: async (t) => {
        if (t.startsWith("bad")) throw new Error(`cannot ${t}`);
        targets.done(t);
      },
    });

    expect(targets.remaining).toEqual(["bad1", "bad2"]);
    expect(report).toEqual({
      processed: 5,
      failed: 2,
      skipped: 0,
      abandoned: false,
    });
    expect(logger.byLevel("error")).toHaveLength(2);
  });

  it("stops once a page read holds only targets that failed in this run, leaving the rest to the next run", async () => {
    const targets = pendingTargets(["bad1", "bad2", "c", "d"]);

    const report = await drainPages({
      job: "test",
      logger: new FakeLogger(),
      readPage: targets.readPage,
      keyOf: (t) => t,
      process: async (t) => {
        if (t.startsWith("bad")) throw new Error(`cannot ${t}`);
        targets.done(t);
      },
    });

    expect(report).toMatchObject({ processed: 0, failed: 2, abandoned: true });
    expect(targets.remaining).toEqual(["bad1", "bad2", "c", "d"]);
  });

  it("skips a target that is selected again after it was processed and still processes the rest", async () => {
    // "b" is processed, then a user changes it, so the query rightly
    // selects it again (e.g. a version differs from its record).
    const remaining = ["a", "b", "c", "d", "e"];
    const order: string[] = [];

    const report = await drainPages({
      job: "test",
      logger: new FakeLogger(),
      readPage: async (page) => remaining.slice((page - 1) * 2, page * 2),
      keyOf: (t) => t,
      process: async (t) => {
        order.push(t);
        if (t !== "b") remaining.splice(remaining.indexOf(t), 1);
      },
    });

    expect(order).toEqual(["a", "b", "c", "d", "e"]);
    expect(remaining).toEqual(["b"]);
    expect(report).toEqual({
      processed: 5,
      failed: 0,
      skipped: 1,
      abandoned: false,
    });
  });

  it("reads past a first page made only of targets it already tried", async () => {
    const remaining = ["x", "y", "a", "b"];
    const order: string[] = [];
    const sticky = new Set(["x", "y"]);

    const report = await drainPages({
      job: "test",
      logger: new FakeLogger(),
      readPage: async (page) => remaining.slice((page - 1) * 2, page * 2),
      keyOf: (t) => t,
      process: async (t) => {
        order.push(t);
        if (!sticky.has(t)) remaining.splice(remaining.indexOf(t), 1);
      },
    });

    expect(order).toEqual(["x", "y", "a", "b"]);
    expect(report).toMatchObject({ processed: 4, skipped: 2 });
  });
});

describe("runDailyJobs", () => {
  it("runs every job with one clock reading and isolates a crashing job", async () => {
    const logger = new FakeLogger();
    const seen: Date[] = [];
    const jobs: DailyJob[] = [
      {
        name: "crashes",
        run: async () => {
          throw new Error("boom");
        },
      },
      {
        name: "works",
        run: async (_container, now) => {
          seen.push(now);
          return { processed: 1, failed: 0, skipped: 0, abandoned: false };
        },
      },
    ];

    const results = await runDailyJobs(containerWith(logger), jobs);

    expect(results.map((r) => [r.name, r.outcome.kind])).toEqual([
      ["crashes", "crashed"],
      ["works", "completed"],
    ]);
    expect(seen).toEqual([NOW]);
    expect(logger.byLevel("error")).toHaveLength(1);
  });
});
