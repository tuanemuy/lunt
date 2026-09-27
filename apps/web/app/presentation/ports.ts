import type { PresentationPorts } from "@repo/core/application/di/presentationPorts";
import { createNotificationMailRenderer } from "./notificationMail";

/**
 * The ports the presentation layer implements for the container
 * (`createRequestContainer`): server-only, used by the Worker entry.
 */
export const presentationPorts: PresentationPorts = {
  notificationMailRenderer: createNotificationMailRenderer,
};
