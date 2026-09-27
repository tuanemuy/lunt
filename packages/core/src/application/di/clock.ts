import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import { type Clock, offsetClock, SystemClock } from "../ports/clock";

type ClockEnv = Readonly<{
  DEV_TOOLS?: string | undefined;
  DAILY_JOBS_AUTO?: string | undefined;
}>;

const devToolsOn = (env: ClockEnv): boolean => env.DEV_TOOLS === "1";

/**
 * The clock of one request, queue batch or scheduled run (F-06). With the
 * development tools on, it runs ahead of the wall clock by the offset the
 * state object keeps (`/__dev/clock` advances it; it never goes back).
 * Anything else — a deployed configuration — gets the wall clock and never
 * reads the offset.
 */
export async function requestClock(
  env: ClockEnv,
  client: Pick<LuntStateClient, "devClockOffset">,
): Promise<Clock> {
  if (!devToolsOn(env)) return SystemClock;
  const offsetMs = await client.devClockOffset();
  return offsetMs === 0 ? SystemClock : offsetClock(SystemClock, offsetMs);
}

/**
 * Whether the Cron Trigger runs the daily jobs. Manual tests switch the
 * automatic run off (`DAILY_JOBS_AUTO=off`) and run the jobs by hand from
 * `/__dev/clock`; the switch counts only with the development tools on,
 * so a deployed configuration always runs them.
 */
export function dailyJobsRunAutomatically(env: ClockEnv): boolean {
  return !(devToolsOn(env) && env.DAILY_JOBS_AUTO === "off");
}
