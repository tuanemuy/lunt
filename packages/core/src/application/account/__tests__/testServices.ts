import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { AccountServices } from "../services";

/**
 * Account's container ports for usecase tests: fakes for external IO,
 * the real adapters (over the in-process state object) for everything
 * else.
 */
export function createTestAccountServices(
  _deps: TestServiceDeps,
): AccountServices {
  return {};
}
