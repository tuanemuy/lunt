import type { AuthorityServices } from "../authority/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Authority's wiring reads. */
export type AuthorityEnv = Readonly<Record<never, never>>;

export function createAuthorityServices(
  _env: AuthorityEnv,
  _deps: ServiceDeps,
): AuthorityServices {
  return {};
}
