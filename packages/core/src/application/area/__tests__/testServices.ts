import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { AreaServices } from "../services";

/**
 * Area's container ports for usecase tests: fakes for external IO, the
 * real adapters (over the in-process state object) for everything else.
 */
export function createTestAreaServices(_deps: TestServiceDeps): AreaServices {
  return {};
}
