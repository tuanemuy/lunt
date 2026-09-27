import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { MediaServices } from "../services";

/**
 * Media's container ports for usecase tests: fakes for external IO, the
 * real adapters (over the in-process state object) for everything else.
 */
export function createTestMediaServices(_deps: TestServiceDeps): MediaServices {
  return {};
}
