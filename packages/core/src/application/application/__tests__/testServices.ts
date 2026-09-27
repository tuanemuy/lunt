import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { ApplicationServices } from "../services";

/**
 * Application's container ports for usecase tests: fakes for external IO,
 * the real adapters (over the in-process state object) for everything
 * else.
 */
export function createTestApplicationServices(
  _deps: TestServiceDeps,
): ApplicationServices {
  return {};
}
