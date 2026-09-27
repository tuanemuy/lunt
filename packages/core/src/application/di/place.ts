import type { PlaceServices } from "../place/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Place's wiring reads. */
export type PlaceEnv = Readonly<Record<never, never>>;

export function createPlaceServices(
  _env: PlaceEnv,
  _deps: ServiceDeps,
): PlaceServices {
  return {};
}
