import type { RequestContainer } from "@repo/core/application/di/types";
import { describe, expect, it } from "vitest";
import { FakeLogger } from "../../__tests__/fakes/fakeLogger";
import {
  type DailyJob,
  type DrainMode,
  type DrainPage,
  drainPages,
  runDailyJobs,
} from "../dailyJobs";

const NOW = new Date("2026-09-28T15:05:00.000Z");

function containerWith(logger: FakeLogger): RequestContainer {
  return {
    clock: { now: () => NOW },
    logger,
  } as unknown as RequestContainer;
}

/**
 * A stored query over string targets. A target named `broken…` cannot be
 * restored (it is reported in `unreadable`); `remove` drops a processed
 * target out of the results.
 */
function query(initial: readonly string[], pageSize: number) {
  const rows = [...initial];
  const reads: number[] = [];
  return {
    rows,
    reads,
    readPage: async (page: number): Promise<DrainPage<string>> => {
      reads.push(page);
      const slice = rows.slice((page - 1) * pageSize, page * pageSize);
      return {
        items: slice.filter((row) => !row.startsWith("broken")),
        unreadable: slice
          .filter((row) => row.startsWith("broken"))
          .map((key) => ({ key, cause: new Error(`${key} is corrupt`) })),
      };
    },
    remove: (target: string) => {
      rows.splice(rows.indexOf(target), 1);
    },
  };
}

function drain(
  q: ReturnType<typeof query>,
  mode: DrainMode,
  process: (target: string) => Promise<void>,
  logger = new FakeLogger(),
) {
  return drainPages({
    job: "test",
    logger,
    mode,
    readPage: q.readPage,
    keyOf: (t) => t,
    process,
  });
}

const failing = (target: string) => target.startsWith("bad");

describe("drainPages (shrinking: processed targets leave the query)", () => {
  it("processes every target by re-reading the first page until it is empty", async () => {
    const q = query(["a", "b", "c", "d", "e"], 2);
    const order: string[] = [];

    const report = await drain(q, "shrinking", async (t) => {
      order.push(t);
      q.remove(t);
    });

    expect(order).toEqual(["a", "b", "c", "d", "e"]);
    expect(q.reads).toEqual([1, 1, 1, 1]);
    expect(report).toEqual({
      processed: 5,
      failed: 0,
      skipped: 0,
      abandoned: false,
    });
  });

  it("does not stop on a failure: the targets behind it are processed and the failures are left to the next run", async () => {
    const q = query(["a", "bad1", "b", "c", "bad2", "d", "e"], 3);
    const logger = new FakeLogger();
    const order: string[] = [];

    const report = await drain(
      q,
      "shrinking",
      async (t) => {
        order.push(t);
        if (failing(t)) throw new Error(`cannot ${t}`);
        q.remove(t);
      },
      logger,
    );

    expect(order).toEqual(["a", "bad1", "b", "c", "bad2", "d", "e"]);
    expect(q.rows).toEqual(["bad1", "bad2"]);
    expect(report).toEqual({
      processed: 5,
      failed: 2,
      skipped: 0,
      abandoned: true,
    });
    expect(logger.byLevel("error")).toHaveLength(2);
  });

  it("stops at a read page whose targets all failed, leaving the rest to the next run", async () => {
    const q = query(["bad1", "bad2", "c", "d"], 2);

    const report = await drain(q, "shrinking", async (t) => {
      if (failing(t)) throw new Error(`cannot ${t}`);
      q.remove(t);
    });

    expect(q.reads).toEqual([1]);
    expect(report).toEqual({
      processed: 0,
      failed: 2,
      skipped: 0,
      abandoned: true,
    });
    expect(q.rows).toEqual(["bad1", "bad2", "c", "d"]);
  });

  it("stops once failures fill the first page, after trying each target once", async () => {
    const q = query(["bad1", "a", "bad2", "b", "c"], 2);
    const tried: string[] = [];

    const report = await drain(q, "shrinking", async (t) => {
      tried.push(t);
      if (failing(t)) throw new Error(`cannot ${t}`);
      q.remove(t);
    });

    // [bad1, a] → [bad1, bad2] (all failed): "b" and "c" wait for the next run.
    expect(tried).toEqual(["bad1", "a", "bad2"]);
    expect(q.reads).toEqual([1, 1]);
    expect(report).toMatchObject({ processed: 1, failed: 2, abandoned: true });
  });

  it("fails an unreadable row as that one target and processes the rest", async () => {
    const q = query(["a", "broken1", "b", "c"], 2);
    const logger = new FakeLogger();
    const order: string[] = [];

    const report = await drain(
      q,
      "shrinking",
      async (t) => {
        order.push(t);
        q.remove(t);
      },
      logger,
    );

    expect(order).toEqual(["a", "b", "c"]);
    expect(q.rows).toEqual(["broken1"]);
    expect(report).toEqual({
      processed: 3,
      failed: 1,
      skipped: 0,
      abandoned: true,
    });
    expect(logger.byLevel("warn")).toMatchObject([
      { meta: { target: "broken1" } },
    ]);
  });

  it("skips a target selected again after it succeeded and ends when nothing new is left", async () => {
    // "b" is processed, then a user changes it, so the query rightly
    // selects it again (e.g. a version differs from its record).
    const q = query(["a", "b", "c", "d", "e"], 2);
    const order: string[] = [];

    const report = await drain(q, "shrinking", async (t) => {
      order.push(t);
      if (t !== "b") q.remove(t);
    });

    expect(order).toEqual(["a", "b", "c", "d", "e"]);
    expect(q.rows).toEqual(["b"]);
    expect(report).toEqual({
      processed: 5,
      failed: 0,
      skipped: 1,
      abandoned: true,
    });
  });

  it("reads at most once per target tried, plus the last read", async () => {
    const targets = Array.from({ length: 40 }, (_, i) =>
      i % 4 === 0 ? `bad${i}` : `t${i}`,
    );
    const q = query(targets, 25);

    const report = await drain(q, "shrinking", async (t) => {
      if (failing(t)) throw new Error(`cannot ${t}`);
      q.remove(t);
    });

    expect(report).toMatchObject({ processed: 30, failed: 10 });
    expect(q.reads.length).toBeLessThanOrEqual(report.processed + 1);
    expect(q.reads.length).toBe(3);
  });
});

describe("drainPages (stable: processed targets stay in the query)", () => {
  it("reads each page once, in turn, until a page is empty", async () => {
    const q = query(["a", "b", "c", "d", "e"], 2);
    const order: string[] = [];

    const report = await drain(q, "stable", async (t) => {
      order.push(t);
    });

    expect(order).toEqual(["a", "b", "c", "d", "e"]);
    expect(q.reads).toEqual([1, 2, 3, 4]);
    expect(report).toEqual({
      processed: 5,
      failed: 0,
      skipped: 0,
      abandoned: false,
    });
  });

  it("does not stop on a failure, nor on a page whose targets all failed", async () => {
    const q = query(["bad1", "bad2", "c", "broken1", "e"], 2);
    const order: string[] = [];

    const report = await drain(q, "stable", async (t) => {
      order.push(t);
      if (failing(t)) throw new Error(`cannot ${t}`);
    });

    expect(order).toEqual(["bad1", "bad2", "c", "e"]);
    expect(q.reads).toEqual([1, 2, 3, 4]);
    expect(report).toEqual({
      processed: 2,
      failed: 3,
      skipped: 0,
      abandoned: false,
    });
  });

  it("does not process twice a target pushed onto the next page", async () => {
    const q = query(["a", "b", "c", "d"], 2);
    const order: string[] = [];

    // A target entering ahead of "a" pushes "b" onto page 2.
    const report = await drain(q, "stable", async (t) => {
      order.push(t);
      if (t === "b") q.rows.unshift("a0");
    });

    expect(order).toEqual(["a", "b", "c", "d"]);
    expect(report).toMatchObject({ processed: 4, failed: 0, skipped: 0 });
  });

  it("leaves a target pulled back onto a page already read to the next run", async () => {
    const q = query(["a", "b", "c", "d"], 2);
    const order: string[] = [];

    // Someone decides "a" while the job is on page 1, so "c" moves onto it.
    await drain(q, "stable", async (t) => {
      order.push(t);
      if (t === "b") q.remove("a");
    });
    expect(order).toEqual(["a", "b", "d"]);

    const next: string[] = [];
    await drain(q, "stable", async (t) => {
      next.push(t);
    });
    expect(next).toEqual(["b", "c", "d"]);
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
