import type { RegionServices } from "../region/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Region's wiring reads. */
export type RegionEnv = Readonly<Record<never, never>>;

export function createRegionServices(
  _env: RegionEnv,
  _deps: ServiceDeps,
): RegionServices {
  return {};
}
