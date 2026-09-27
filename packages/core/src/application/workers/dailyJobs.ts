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
  /** True when a page of only failures stopped the run early. */
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
 * The shared progression rule of daily jobs over a query whose processed
 * targets drop out of its results: process the first page one target at
 * a time (each target in its own unit of work, inside `process`), then
 * read the first page again. A failure does not stop the run; a page
 * whose every target failed ends it, leaving the rest to the next run.
 *
 * A target that comes back after it was processed successfully means
 * `process` did not take it out of the query — a bug that would loop
 * forever, so the run stops and reports it instead.
 */
export async function drainByFirstPage<T>(
  args: Readonly<{
    job: string;
    logger: Logger;
    readFirstPage: () => Promise<readonly T[]>;
    keyOf: (target: T) => string;
    process: (target: T) => Promise<void>;
  }>,
): Promise<DrainReport> {
  const done = new Set<string>();
  let processed = 0;
  let failed = 0;
  for (;;) {
    const page = await args.readFirstPage();
    if (page.length === 0) {
      return { processed, failed, abandoned: false };
    }
    let failedOnPage = 0;
    for (const target of page) {
      const key = args.keyOf(target);
      if (done.has(key)) {
        throw new Error(
          `[daily] ${args.job}: target ${key} is still selected after it was processed`,
        );
      }
      try {
        await args.process(target);
        done.add(key);
        processed += 1;
      } catch (error) {
        failedOnPage += 1;
        failed += 1;
        args.logger.error(`[daily] ${args.job}: target ${key} failed`, {
          job: args.job,
          target: key,
          cause: error,
        });
      }
    }
    if (failedOnPage === page.length) {
      return { processed, failed, abandoned: true };
    }
  }
}
