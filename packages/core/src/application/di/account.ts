import type { AccountServices } from "../account/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Account's wiring reads. */
export type AccountEnv = Readonly<Record<never, never>>;

export function createAccountServices(
  _env: AccountEnv,
  _deps: ServiceDeps,
): AccountServices {
  return {};
}
