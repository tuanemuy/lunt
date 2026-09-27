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
  /** Targets selected again after this run tried them, left to the next run. */
  skipped: number;
  /** True when a read whose every new target failed stopped the run early. */
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
 * The shared progression rule of daily jobs (`spec/flows/index.md`
 * 「共通の前提」) over a query whose processed targets drop out of its
 * results: process a page one target at a time (each target in its own
 * unit of work, inside `process`), then read the first page again. One
 * target failing does not stop the run; a page read whose new targets all
 * failed, with nothing else on it succeeding, ends it — leaving the rest
 * to the next run.
 *
 * Each target is tried at most once per run. A target that is selected
 * again after this run processed it — a user changed it afterwards, so
 * the query rightly picks it up again — is skipped and left to the next
 * run. Targets that failed are not retried in the same run either. A page
 * holding only targets already tried makes the run read the next page, so
 * they never stall the targets behind them.
 */
export async function drainPages<T>(
  args: Readonly<{
    job: string;
    logger: Logger;
    /** Page `n` (1-based) of the targets the job still has to process. */
    readPage: (page: number) => Promise<readonly T[]>;
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
  let page = 1;
  for (;;) {
    const targets = await args.readPage(page);
    if (targets.length === 0) return report(false);
    const keys = targets.map(args.keyOf);
    let processedNow = 0;
    for (const [index, target] of targets.entries()) {
      const key = keys[index] ?? args.keyOf(target);
      if (succeeded.has(key)) {
        reselected.add(key);
        continue;
      }
      if (failedKeys.has(key)) continue;
      processedNow += 1;
      try {
        await args.process(target);
        succeeded.add(key);
      } catch (error) {
        failedKeys.add(key);
        args.logger.error(`[daily] ${args.job}: target ${key} failed`, {
          job: args.job,
          target: key,
          cause: error,
        });
      }
    }
    if (processedNow === 0) {
      page += 1;
      continue;
    }
    if (keys.every((key) => failedKeys.has(key))) return report(true);
    page = 1;
  }
}
