import type { AreaServices } from "../area/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Area's wiring reads. */
export type AreaEnv = Readonly<Record<never, never>>;

export function createAreaServices(
  _env: AreaEnv,
  _deps: ServiceDeps,
): AreaServices {
  return {};
}
