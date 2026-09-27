import type { RequestContainer } from "@repo/core/application/di/types";
import { describe, expect, it } from "vitest";
import { FakeLogger } from "../../__tests__/fakes/fakeLogger";
import { type DailyJob, drainByFirstPage, runDailyJobs } from "../dailyJobs";

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
    readFirstPage: async () => remaining.slice(0, pageSize),
    done: (target: string) => {
      remaining.splice(remaining.indexOf(target), 1);
    },
  };
}

describe("drainByFirstPage", () => {
  it("processes every target by re-reading the first page until it is empty", async () => {
    const targets = pendingTargets(["a", "b", "c", "d", "e"]);
    const order: string[] = [];

    const report = await drainByFirstPage({
      job: "test",
      logger: new FakeLogger(),
      readFirstPage: targets.readFirstPage,
      keyOf: (t) => t,
      process: async (t) => {
        order.push(t);
        targets.done(t);
      },
    });

    expect(order).toEqual(["a", "b", "c", "d", "e"]);
    expect(report).toEqual({ processed: 5, failed: 0, abandoned: false });
  });

  it("does not stop on a failure and stops once a whole page failed", async () => {
    const targets = pendingTargets(["a", "bad1", "b", "bad2", "c"]);
    const logger = new FakeLogger();

    const report = await drainByFirstPage({
      job: "test",
      logger,
      readFirstPage: targets.readFirstPage,
      keyOf: (t) => t,
      process: async (t) => {
        if (t.startsWith("bad")) throw new Error(`cannot ${t}`);
        targets.done(t);
      },
    });

    // The first page ends up holding only the two failing targets; the
    // run stops there and leaves "c" to the next run.
    expect(targets.remaining).toEqual(["bad1", "bad2", "c"]);
    expect(report.processed).toBe(2);
    expect(report.abandoned).toBe(true);
    expect(logger.byLevel("error").length).toBe(report.failed);
  });

  it("refuses to loop when a processed target stays selected", async () => {
    await expect(
      drainByFirstPage({
        job: "test",
        logger: new FakeLogger(),
        readFirstPage: async () => ["stuck"],
        keyOf: (t) => t,
        process: async () => {},
      }),
    ).rejects.toThrow("still selected");
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
          return { processed: 1, failed: 0, abandoned: false };
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
