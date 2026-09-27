import { ForbiddenError } from "../errors";
import type { ServiceArgs } from "../types";
import { dailyJobs } from "../workers/dailyJobRegistry";
import { type DailyJobResult, runDailyJobs } from "../workers/dailyJobs";

/**
 * Controls the development clock (F-06). On the container as `devClock`
 * while the development tools are on, `null` otherwise.
 */
export interface DevClockControl {
  /** How far the application's time runs ahead of the wall clock. */
  offsetMs(): Promise<number>;
  /** Moves it forward by `ms` (never back); returns the new offset. */
  advance(ms: number): Promise<number>;
}

export type DevClockView = Readonly<{
  /** The application's time for this request. */
  now: Date;
  offsetMs: number;
}>;

function requireDevClock(
  container: ServiceArgs<unknown>["container"],
): DevClockControl {
  if (!container.runtime.devTools || container.devClock === null) {
    throw new ForbiddenError(
      "DEV_TOOLS_DISABLED",
      "Development tools are disabled",
    );
  }
  return container.devClock;
}

/** Development tool: the application's time and its offset. */
export async function readDevClock({
  container,
}: ServiceArgs<Readonly<Record<never, never>>>): Promise<DevClockView> {
  const offsetMs = await requireDevClock(container).offsetMs();
  return { now: container.clock.now(), offsetMs };
}

/**
 * Development tool: moves the application's time forward by `ms`. The
 * next request, message and job run on the new time; the current request
 * keeps the time it started with.
 */
export async function advanceDevClock({
  container,
  input,
}: ServiceArgs<Readonly<{ ms: number }>>): Promise<
  Readonly<{ offsetMs: number }>
> {
  const offsetMs = await requireDevClock(container).advance(input.ms);
  return { offsetMs };
}

/**
 * Development tool: runs every daily job now, on this request's
 * application time — what the Cron Trigger does at 00:05 JST.
 */
export async function runDailyJobsNow({
  container,
}: ServiceArgs<Readonly<Record<never, never>>>): Promise<
  readonly DailyJobResult[]
> {
  requireDevClock(container);
  return runDailyJobs(container, dailyJobs);
}
