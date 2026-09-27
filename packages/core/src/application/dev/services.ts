import type { DevClockControl } from "./devClock";

/** Development tools on the container (`DEV_TOOLS=1`; `null` otherwise). */
export type DevServices = Readonly<{
  devClock: DevClockControl | null;
}>;
