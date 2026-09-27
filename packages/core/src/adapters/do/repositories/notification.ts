import type { NotificationRepositories } from "@repo/core/domain/notification/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Notification's aggregate repositories of one unit of work. */
export function createNotificationRepositories(
  _deps: RepositoryDeps,
): NotificationRepositories {
  return {};
}
