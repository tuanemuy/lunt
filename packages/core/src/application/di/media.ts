import type { MediaServices } from "../media/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Media's wiring reads. */
export type MediaEnv = Readonly<Record<never, never>>;

export function createMediaServices(
  _env: MediaEnv,
  _deps: ServiceDeps,
): MediaServices {
  return {};
}
