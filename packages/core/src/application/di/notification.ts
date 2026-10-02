import { TransportMailer } from "@repo/core/adapters/shared/transportMailer";
import { content } from "@repo/core/config";
import type { NotificationServices } from "../notification/services";
import { createMailTransport, type MailEnv, readMailSettings } from "./mail";
import type { ServiceDeps } from "./serviceDeps";

/**
 * Environment variables Notification's wiring reads: the shared mail
 * settings, and the public origin its mails link to.
 */
export type NotificationEnv = MailEnv & Readonly<{ APP_URL: string }>;

export function createNotificationServices(
  env: NotificationEnv,
  deps: ServiceDeps,
): NotificationServices {
  const mail = createMailTransport(
    readMailSettings(env, deps.runtime.devTools),
    deps,
  );
  return {
    notificationMailRenderer: deps.presentation.notificationMailRenderer({
      appUrl: env.APP_URL,
      siteName: content.siteName,
    }),
    mailer: new TransportMailer(mail.transport),
  };
}
