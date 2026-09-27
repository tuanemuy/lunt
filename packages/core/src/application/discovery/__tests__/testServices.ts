import { DoDetailQueries } from "@repo/core/adapters/do/detailQueries";
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
  return {
    detailQueries: new DoDetailQueries(deps.client, deps.idGenerator),
    referenceQueries: new DoReferenceQueries(deps.client, deps.idGenerator),
  };
}
