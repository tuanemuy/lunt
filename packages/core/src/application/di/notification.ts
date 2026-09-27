import type { NotificationServices } from "../notification/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Notification's wiring reads. */
export type NotificationEnv = Readonly<Record<never, never>>;

export function createNotificationServices(
  _env: NotificationEnv,
  _deps: ServiceDeps,
): NotificationServices {
  return {};
}
