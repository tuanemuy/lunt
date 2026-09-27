import type { RenderedMail } from "@repo/core/domain/notification/mail";
import type { Mailer } from "@repo/core/domain/notification/ports/mailer";
import type { MailTransport } from "./transport";

/**
 * Notification's `Mailer` over the deployment's `MailTransport` (the
 * development inbox or SMTP, chosen once in `application/di/mail.ts`). The
 * rendered body goes out as the plain-text part; `link` is already in it.
 * Resolves when the transport accepts the mail; its errors pass through.
 */
export class TransportMailer implements Mailer {
  constructor(private readonly transport: MailTransport) {}

  send(mail: RenderedMail): Promise<void> {
    return this.transport.send({
      to: mail.to,
      subject: mail.subject,
      text: mail.body,
    });
  }
}
