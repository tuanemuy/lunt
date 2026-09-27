import type { NotificationErrorCode } from "@repo/core/domain/notification/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Notification business error is shown (CS-08 / CS-10). */
export const notificationErrorCatalog = {} satisfies Record<
  NotificationErrorCode,
  BusinessErrorPresentation
>;
