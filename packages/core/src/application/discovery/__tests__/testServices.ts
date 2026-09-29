import { DoDetailQueries } from "@repo/core/adapters/do/detailQueries";
import { DoExplorationQueries } from "@repo/core/adapters/do/explorationQueries";
import { DoKeywordSearchQueries } from "@repo/core/adapters/do/keywordSearchQueries";
import { DoReferenceQueries } from "@repo/core/adapters/do/referenceQueries";
import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { DiscoveryServices } from "../services";

/**
 * Discovery's container ports for usecase tests: the real adapters over the
 * in-process state object (Discovery has no external IO).
 */
export function createTestDiscoveryServices(
  deps: TestServiceDeps,
): DiscoveryServices {
  const { client, idGenerator } = deps;
  return {
    detailQueries: new DoDetailQueries(client, idGenerator),
    referenceQueries: new DoReferenceQueries(client, idGenerator),
    explorationQueries: new DoExplorationQueries(client, idGenerator),
    keywordSearchQueries: new DoKeywordSearchQueries(client, idGenerator),
  };
}
