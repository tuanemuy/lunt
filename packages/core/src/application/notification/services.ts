import type { Mailer } from "@repo/core/domain/notification/ports/mailer";
import type { NotificationMailRenderer } from "@repo/core/domain/notification/ports/notificationMailRenderer";

/**
 * Notification's ports and settings that live on the container: read-only ports
 * that do not join a unit of work, external IO ports, and settings. Both are
 * called outside `run`.
 */
export type NotificationServices = Readonly<{
  /** Implemented by the presentation layer (`PresentationPorts`). */
  notificationMailRenderer: NotificationMailRenderer;
  mailer: Mailer;
}>;
