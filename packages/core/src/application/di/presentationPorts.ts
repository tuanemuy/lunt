import type { NotificationMailRenderer } from "@repo/core/domain/notification/ports/notificationMailRenderer";

/** What Notification's mail renderer needs to know about the deployment. */
export type NotificationMailSettings = Readonly<{
  /** The public origin the mails' links point at (`APP_URL`). */
  appUrl: string;
  siteName: string;
}>;

/**
 * Ports the presentation layer (`apps/web`) implements and hands to the
 * container. The Worker entry passes them to `createRequestContainer`.
 */
export type PresentationPorts = Readonly<{
  /**
   * Builds Notification's `NotificationMailRenderer`, which owns the
   * destination → screen URL mapping.
   */
  notificationMailRenderer: (
    settings: NotificationMailSettings,
  ) => NotificationMailRenderer;
}>;
