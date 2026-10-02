import { DoStewardedTargetDirectory } from "@repo/core/adapters/durableObject/stewardedTargetDirectory";
import type { AuthorityServices } from "../authority/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Authority's wiring reads. */
export type AuthorityEnv = Readonly<Record<never, never>>;

export function createAuthorityServices(
  _env: AuthorityEnv,
  deps: ServiceDeps,
): AuthorityServices {
  return {
    stewardedTargetDirectory: new DoStewardedTargetDirectory(deps.client),
  };
}
