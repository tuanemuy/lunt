import type { UnreadableRow } from "@repo/core/domain/common/scan";
import type { RequestContainer } from "../di/types";
import type { Logger } from "../ports/logger";

/**
 * One daily job (`spec/flows/index.md` 「日次のジョブ」). A job decides its
 * targets from stored state and the current time only, so running it
 * again yields the same result; `now` is the job run's single clock
 * reading.
 */
export type DailyJob = Readonly<{
  name: string;
  run(container: RequestContainer, now: Date): Promise<DrainReport>;
}>;

export type DrainReport = Readonly<{
  processed: number;
  failed: number;
  /**
   * Targets a shrinking query selected again after they succeeded (they
   * changed meanwhile), left to the next run.
   */
  skipped: number;
  /**
   * True when a shrinking run was cut off (打ち切り) at a page holding only
   * targets it had already tried, rather than running the query dry.
   */
  abandoned: boolean;
}>;

export type DailyJobResult = Readonly<{
  name: string;
  outcome:
    | Readonly<{ kind: "completed"; report: DrainReport }>
    | Readonly<{ kind: "crashed"; error: unknown }>;
}>;

/**
 * Runs every job independently: jobs have no ordering dependency, and one
 * job crashing does not stop the others. What a crashed job left behind
 * is picked up by the next run.
 */
export async function runDailyJobs(
  container: RequestContainer,
  jobs: readonly DailyJob[],
): Promise<readonly DailyJobResult[]> {
  const now = container.clock.now();
  const settled = await Promise.allSettled(
    jobs.map((job) => job.run(container, now)),
  );
  return settled.map((result, index): DailyJobResult => {
    const name = jobs[index]?.name ?? `#${index}`;
    if (result.status === "fulfilled") {
      container.logger.info(`[daily] ${name} completed`, {
        job: name,
        ...result.value,
      });
      return { name, outcome: { kind: "completed", report: result.value } };
    }
    container.logger.error(`[daily] ${name} crashed`, {
      job: name,
      cause: result.reason,
    });
    return { name, outcome: { kind: "crashed", error: result.reason } };
  });
}

/**
 * How a daily job's query treats the targets the job processed:
 *
 * - `"shrinking"`: a processed target leaves the results (it was deleted,
 *   claimed or recorded), so the run re-reads the first page.
 * - `"stable"`: a processed target stays in the results (an overdue
 *   application stays overdue until someone decides it), so the run reads
 *   the pages in turn.
 */
export type DrainMode = "shrinking" | "stable";

/** One page read of a daily job's query (a `ScanResult` is one). */
export type DrainPage<T> = Readonly<{
  items: readonly T[];
  /** Rows that could not be restored; each fails as its own target. */
  unreadable: readonly UnreadableRow[];
}>;

/**
 * The shared progression rule of daily jobs (`spec/flows/index.md`
 * 「共通の前提」): each target is processed in its own unit of work (inside
 * `process`), and one target failing — an unreadable row included — does
 * not stop the run. Each target is tried at most once per run (D-15):
 * what failed, and what the query selects again after it succeeded (it
 * changed meanwhile), is left to the next run.
 *
 * - `"shrinking"`: re-reads the first page after each page. A page whose
 *   targets all failed in this run ends the run, as does one holding no
 *   target the run has not tried yet (the rest came back after
 *   succeeding); whatever lies beyond it is left to the next run
 *   (`abandoned`).
 * - `"stable"`: reads page 1, 2, … until a page is empty. A target met
 *   again because an earlier one left the results is not processed
 *   twice; one pushed back onto a page already read is picked up by the
 *   next run.
 *
 * Reads stay proportional to the targets tried: a shrinking read either
 * tries at least one new target or ends the run, and a stable run reads
 * each page once.
 */
export async function drainPages<T>(
  args: Readonly<{
    job: string;
    logger: Logger;
    mode: DrainMode;
    /** Page `n` (1-based) of the job's query. */
    readPage: (page: number) => Promise<DrainPage<T>>;
    keyOf: (target: T) => string;
    process: (target: T) => Promise<void>;
  }>,
): Promise<DrainReport> {
  const succeeded = new Set<string>();
  const failedKeys = new Set<string>();
  const reselected = new Set<string>();
  const report = (abandoned: boolean): DrainReport => ({
    processed: succeeded.size,
    failed: failedKeys.size,
    skipped: reselected.size,
    abandoned,
  });
  const fail = (
    key: string,
    level: "warn" | "error",
    what: string,
    cause: unknown,
  ): void => {
    failedKeys.add(key);
    args.logger[level](`[daily] ${args.job}: target ${key} ${what}`, {
      job: args.job,
      target: key,
      cause,
    });
  };
  const isTried = (key: string): boolean =>
    succeeded.has(key) || failedKeys.has(key);

  let page = 1;
  for (;;) {
    const read = await args.readPage(page);
    const entries = read.items.length + read.unreadable.length;
    if (entries === 0) return report(false);
    let triedNow = 0;
    for (const row of read.unreadable) {
      if (isTried(row.key)) continue;
      triedNow += 1;
      fail(row.key, "warn", "cannot be read; skipped", row.cause);
    }
    for (const target of read.items) {
      const key = args.keyOf(target);
      if (isTried(key)) {
        if (args.mode === "shrinking" && succeeded.has(key)) {
          reselected.add(key);
        }
        continue;
      }
      triedNow += 1;
      try {
        await args.process(target);
        succeeded.add(key);
      } catch (error) {
        fail(key, "error", "failed", error);
      }
    }
    if (args.mode === "stable") {
      page += 1;
      continue;
    }
    const allFailed =
      read.unreadable.every((row) => failedKeys.has(row.key)) &&
      read.items.every((target) => failedKeys.has(args.keyOf(target)));
    if (triedNow === 0 || allFailed) return report(true);
  }
}
