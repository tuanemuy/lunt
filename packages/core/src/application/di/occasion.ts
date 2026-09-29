import type { OccasionServices } from "../occasion/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Occasion's wiring reads. */
export type OccasionEnv = Readonly<Record<never, never>>;

export function createOccasionServices(
  _env: OccasionEnv,
  _deps: ServiceDeps,
): OccasionServices {
  return {};
}
