import type { ApplicationServices } from "../application/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Application's wiring reads. */
export type ApplicationEnv = Readonly<Record<never, never>>;

export function createApplicationServices(
  _env: ApplicationEnv,
  _deps: ServiceDeps,
): ApplicationServices {
  return {};
}
