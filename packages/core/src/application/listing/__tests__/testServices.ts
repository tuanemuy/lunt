import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { ListingServices } from "../services";

/**
 * Listing's container ports for usecase tests: fakes for external IO, the
 * real adapters (over the in-process state object) for everything else.
 */
export function createTestListingServices(
  _deps: TestServiceDeps,
): ListingServices {
  return {};
}
