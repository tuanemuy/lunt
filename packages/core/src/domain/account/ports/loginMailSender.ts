import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { LinkToken, LoginCode } from "../loginSecret";

/**
 * Sends the login mail (`spec/domains/account.md` 「LoginMailSender」):
 * one mail to `to` carrying both the link — which hands `linkToken` back
 * to Lunt from whichever browser opens it — and the code. Resolves once
 * the mail is accepted for delivery. Never goes through Notification, so
 * the secrets never reach the outbox; keeping them out of logs and error
 * messages is the adapter's job.
 */
export interface LoginMailSender {
  send(
    mail: Readonly<{ to: EmailAddress; linkToken: LinkToken; code: LoginCode }>,
  ): Promise<void>;
}
