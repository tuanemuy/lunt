import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { MailTransport, OutgoingMail } from "../transport";

/**
 * Test transport: keeps every accepted mail in memory. `fail` makes the
 * next sends reject as an outage would; `beforeAccept` runs inside a send,
 * before the mail is accepted, to interleave other work with it.
 */
export class InMemoryMailTransport implements MailTransport {
  readonly sent: OutgoingMail[] = [];
  private failures = 0;
  beforeAccept: ((mail: OutgoingMail) => Promise<void>) | null = null;

  /** The next `times` sends fail with `SystemError(EXTERNAL_API_ERROR)`. */
  fail(times = 1): void {
    this.failures = times;
  }

  sentTo(to: string): readonly OutgoingMail[] {
    return this.sent.filter((mail) => mail.to === to);
  }

  async send(mail: OutgoingMail): Promise<void> {
    const hook = this.beforeAccept;
    this.beforeAccept = null;
    if (hook !== null) await hook(mail);
    if (this.failures > 0) {
      this.failures -= 1;
      throw new SystemError(
        SystemErrorCode.ExternalApiError,
        "Mail transport is down",
      );
    }
    this.sent.push(mail);
  }
}
