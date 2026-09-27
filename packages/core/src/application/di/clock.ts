import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import { type Clock, offsetClock, SystemClock } from "../ports/clock";

type ClockEnv = Readonly<{
  DEV_TOOLS?: string | undefined;
  DEV_TOOLS_ALLOW_REMOTE?: string | undefined;
  DAILY_JOBS_AUTO?: string | undefined;
}>;

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
]);

/**
 * Whether the development tools are on for this run (design.md D-19):
 * `DEV_TOOLS=1`, and — for an HTTP request — a request to this machine
 * (`localhost`, `127.0.0.1`, `[::1]`) unless `DEV_TOOLS_ALLOW_REMOTE=1`
 * opens them to a shared test environment. Queue batches and scheduled
 * runs (`host` null) are not reachable from outside and follow
 * `DEV_TOOLS` alone. The fake provider lets anyone become anyone, so a
 * remote environment with the tools on must be trusted.
 */
export function devToolsEnabled(env: ClockEnv, host: string | null): boolean {
  if (env.DEV_TOOLS !== "1") return false;
  if (host === null) return true;
  return (
    LOOPBACK_HOSTS.has(host.toLowerCase()) || env.DEV_TOOLS_ALLOW_REMOTE === "1"
  );
}

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
  host: string | null = null,
): Promise<Clock> {
  if (!devToolsEnabled(env, host)) return SystemClock;
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
  return !(devToolsEnabled(env, null) && env.DAILY_JOBS_AUTO === "off");
}
