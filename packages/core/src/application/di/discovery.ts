import { DoDetailQueries } from "@repo/core/adapters/do/detailQueries";
import { DoReferenceQueries } from "@repo/core/adapters/do/referenceQueries";
import type { DiscoveryServices } from "../discovery/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Discovery's wiring reads. */
export type DiscoveryEnv = Readonly<Record<never, never>>;

export function createDiscoveryServices(
  _env: DiscoveryEnv,
  deps: ServiceDeps,
): DiscoveryServices {
  return {
    detailQueries: new DoDetailQueries(deps.client, deps.shared.idGenerator),
    referenceQueries: new DoReferenceQueries(
      deps.client,
      deps.shared.idGenerator,
    ),
  };
}
