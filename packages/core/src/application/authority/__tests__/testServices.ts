import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { AuthorityServices } from "../services";

/**
 * Authority's container ports for usecase tests: fakes for external IO,
 * the real adapters (over the in-process state object) for everything
 * else.
 */
export function createTestAuthorityServices(
  _deps: TestServiceDeps,
): AuthorityServices {
  return {};
}
