import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { validateInput } from "./validator";

export type DevClockState = Readonly<{
  /** ISO 8601: the application's time when the page was read. */
  now: string;
  offsetMs: number;
}>;

export type DailyJobRunView = Readonly<{
  name: string;
  /** e.g. `processed 3, failed 0, skipped 0`, or the crash message. */
  summary: string;
  ok: boolean;
}>;

async function load() {
  const [{ getContainer }, usecases] = await Promise.all([
    import("@repo/core/application/di/containerStore"),
    import("@repo/core/application/dev/devClock"),
  ]);
  return { container: await getContainer(), ...usecases };
}

/** Development tool: the application's time (`/__dev/clock`). */
export const readDevClockFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async (): Promise<DevClockState> => {
    const { container, readDevClock } = await load();
    const view = await readDevClock({ container, input: {} });
    return { now: view.now.toISOString(), offsetMs: view.offsetMs };
  });

const DAY_MS = 24 * 60 * 60 * 1000;

/** Development tool: move the application's time forward. */
export const advanceDevClockFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      z.object({
        ms: z
          .number()
          .int()
          .positive()
          .max(3660 * DAY_MS),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { container, advanceDevClock } = await load();
    return advanceDevClock({ container, input: { ms: data.ms } });
  });

/** Development tool: put the application's time back to the wall clock. */
export const resetDevClockFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { container, resetDevClock } = await load();
    await resetDevClock({ container, input: {} });
  });

/** Development tool: run every daily job now, on the application's time. */
export const runDailyJobsFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .handler(async (): Promise<readonly DailyJobRunView[]> => {
    const { container, runDailyJobsNow } = await load();
    const results = await runDailyJobsNow({ container, input: {} });
    return results.map((result) =>
      result.outcome.kind === "completed"
        ? {
            name: result.name,
            ok: true,
            summary: `processed ${result.outcome.report.processed}, failed ${result.outcome.report.failed}, skipped ${result.outcome.report.skipped}${result.outcome.report.abandoned ? ", abandoned" : ""}`,
          }
        : {
            name: result.name,
            ok: false,
            summary:
              result.outcome.error instanceof Error
                ? result.outcome.error.message
                : String(result.outcome.error),
          },
    );
  });
