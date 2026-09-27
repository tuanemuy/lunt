import type { EmailAddress } from "@repo/core/domain/common/emailAddress";

/** A mail ready to go: the renderer's output, the transport's input. */
export type OutgoingMail = Readonly<{
  to: EmailAddress;
  subject: string;
  text: string;
  html?: string | undefined;
}>;

/**
 * Delivers rendered mail. Shared by every mail-sending port adapter —
 * Account's `LoginMailSender` and Notification's `Mailer` — so the choice
 * between the development inbox and SMTP is made once, in DI
 * (`application/di/mail.ts`). The sender address is the transport's
 * configuration, not the caller's.
 *
 * `send` resolves once the mail is accepted (stored in the development
 * inbox, or accepted by the SMTP server). Every call sends one mail; no
 * de-duplication. Failures surface as `SystemError`, whose message never
 * carries the mail's content.
 */
export interface MailTransport {
  send(mail: OutgoingMail): Promise<void>;
}
