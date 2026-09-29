import { DoDetailQueries } from "@repo/core/adapters/do/detailQueries";
import { DoExplorationQueries } from "@repo/core/adapters/do/explorationQueries";
import { DoKeywordSearchQueries } from "@repo/core/adapters/do/keywordSearchQueries";
import { DoReferenceQueries } from "@repo/core/adapters/do/referenceQueries";
import type { DiscoveryServices } from "../discovery/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Discovery's wiring reads. */
export type DiscoveryEnv = Readonly<Record<never, never>>;

export function createDiscoveryServices(
  _env: DiscoveryEnv,
  deps: ServiceDeps,
): DiscoveryServices {
  const { client } = deps;
  const { idGenerator } = deps.shared;
  return {
    detailQueries: new DoDetailQueries(client, idGenerator),
    referenceQueries: new DoReferenceQueries(client, idGenerator),
    explorationQueries: new DoExplorationQueries(client, idGenerator),
    keywordSearchQueries: new DoKeywordSearchQueries(client, idGenerator),
  };
}
