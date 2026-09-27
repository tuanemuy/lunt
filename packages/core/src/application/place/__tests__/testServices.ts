import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { PlaceServices } from "../services";

/**
 * Place's container ports for usecase tests: fakes for external IO, the
 * real adapters (over the in-process state object) for everything else.
 */
export function createTestPlaceServices(_deps: TestServiceDeps): PlaceServices {
  return {};
}
