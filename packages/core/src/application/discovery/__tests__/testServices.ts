import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { DiscoveryServices } from "../services";

/**
 * Discovery's container ports for usecase tests: fakes for external IO, the
 * real adapters (over the in-process state object) for everything else.
 */
export function createTestDiscoveryServices(
  _deps: TestServiceDeps,
): DiscoveryServices {
  return {};
}
