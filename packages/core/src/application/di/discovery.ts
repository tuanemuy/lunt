import type { DiscoveryServices } from "../discovery/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Discovery's wiring reads. */
export type DiscoveryEnv = Readonly<Record<never, never>>;

export function createDiscoveryServices(
  _env: DiscoveryEnv,
  _deps: ServiceDeps,
): DiscoveryServices {
  return {};
}
