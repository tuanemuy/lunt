import type { RenderedMail } from "../mail";

/**
 * Sends a rendered mail (`spec/domains/notification.md` 「Mailer」): one mail
 * to `mail.to` with `subject` and `body` per call, resolving once the send
 * is accepted. No de-duplication — `MailDispatchLedger` and the usecase own
 * that. `link` is already in the body and not treated separately. Never
 * reads accounts; not used for login mail.
 */
export interface Mailer {
  send(mail: RenderedMail): Promise<void>;
}
