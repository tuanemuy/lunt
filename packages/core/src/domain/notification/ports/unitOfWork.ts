import type { MailDispatchLedger } from "./mailDispatchLedger";
import type { NotificationRepository } from "./notificationRepository";

/**
 * Notification's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type NotificationRepositories = Readonly<{
  notificationRepository: NotificationRepository;
  mailDispatchLedger: MailDispatchLedger;
}>;
