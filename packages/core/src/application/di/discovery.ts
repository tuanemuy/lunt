import { DoDetailQueries } from "@repo/core/adapters/durableObject/detailQueries";
import { DoExplorationQueries } from "@repo/core/adapters/durableObject/explorationQueries";
import { DoFeedCandidateQueries } from "@repo/core/adapters/durableObject/feedCandidateQueries";
import { DoKeywordSearchQueries } from "@repo/core/adapters/durableObject/keywordSearchQueries";
import { DoReferenceQueries } from "@repo/core/adapters/durableObject/referenceQueries";
import { z } from "zod";
import type {
  DiscoveryServices,
  DiscoverySettings,
} from "../discovery/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Discovery's wiring reads. */
export type DiscoveryEnv = Readonly<{
  /** The vicinity radius in metres (default 3,000). */
  VICINITY_RADIUS_METERS?: string | undefined;
}>;

export const DEFAULT_VICINITY_RADIUS_METERS = 3_000;

const discoverySettingsSchema = z.object({
  vicinityRadiusMeters: z.coerce
    .number()
    .positive()
    .finite()
    .default(DEFAULT_VICINITY_RADIUS_METERS),
});

export function readDiscoverySettings(env: DiscoveryEnv): DiscoverySettings {
  return discoverySettingsSchema.parse({
    vicinityRadiusMeters: env.VICINITY_RADIUS_METERS,
  });
}

export function createDiscoveryServices(
  env: DiscoveryEnv,
  deps: ServiceDeps,
): DiscoveryServices {
  const { client } = deps;
  const { idGenerator } = deps.shared;
  return {
    detailQueries: new DoDetailQueries(client, idGenerator),
    referenceQueries: new DoReferenceQueries(client, idGenerator),
    explorationQueries: new DoExplorationQueries(client, idGenerator),
    keywordSearchQueries: new DoKeywordSearchQueries(client, idGenerator),
    discoverySettings: readDiscoverySettings(env),
    feedCandidateQueries: new DoFeedCandidateQueries(client, idGenerator),
  };
}
