import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { NotificationServices } from "../services";

/**
 * Notification's container ports for usecase tests: fakes for external IO,
 * the real adapters (over the in-process state object) for everything
 * else.
 */
export function createTestNotificationServices(
  _deps: TestServiceDeps,
): NotificationServices {
  return {};
}
