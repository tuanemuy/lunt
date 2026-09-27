import type { NotificationRepositories } from "@repo/core/domain/notification/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";
import { DoMailDispatchLedger } from "./mailDispatchLedger";
import { DoNotificationRepository } from "./notificationRepository";

/** Notification's aggregate repositories of one unit of work. */
export function createNotificationRepositories(
  deps: RepositoryDeps,
): NotificationRepositories {
  return {
    notificationRepository: new DoNotificationRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
    mailDispatchLedger: new DoMailDispatchLedger(deps.client, deps.writes),
  };
}
