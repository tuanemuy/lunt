import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { MailTransport, OutgoingMail } from "../shared/mailTransport";

export type SmtpSettings = Readonly<{
  host: string;
  /** Always 465: implicit TLS (design.md D-07). */
  port: 465;
  username: string;
  password: string;
  from: Readonly<{ email: string; name?: string | undefined }>;
}>;

/**
 * SMTP over implicit TLS on port 465 with `worker-mailer`, through the
 * Workers TCP sockets API (`cloudflare:sockets`). STARTTLS on 587 is not
 * used: workerd's `startTls()` is unreliable (P0 research e).
 *
 * `worker-mailer` imports `cloudflare:sockets` at module scope, so it is
 * loaded only when a mail is sent: this module stays importable from Node
 * (tests, tooling) as long as nothing sends through it there.
 *
 * One connection per mail — login and notification mail volumes do not
 * justify pooling, and a Worker invocation cannot keep one open anyway.
 */
export class SmtpMailTransport implements MailTransport {
  constructor(private readonly settings: SmtpSettings) {}

  async send(mail: OutgoingMail): Promise<void> {
    const { WorkerMailer, LogLevel } = await import("worker-mailer");
    try {
      await WorkerMailer.send(
        {
          host: this.settings.host,
          port: this.settings.port,
          secure: true,
          startTls: false,
          credentials: {
            username: this.settings.username,
            password: this.settings.password,
          },
          authType: ["plain", "login"],
          // The library's own logs could echo the dialogue; failures are
          // reported below without content.
          logLevel: LogLevel.NONE,
        },
        {
          from:
            this.settings.from.name === undefined
              ? this.settings.from.email
              : {
                  name: this.settings.from.name,
                  email: this.settings.from.email,
                },
          to: mail.to,
          subject: mail.subject,
          text: mail.text,
          ...(mail.html === undefined ? {} : { html: mail.html }),
        },
      );
    } catch (error) {
      throw new SystemError(
        SystemErrorCode.ExternalApiError,
        `SMTP delivery via ${this.settings.host} failed`,
        error instanceof Error ? new Error(error.message) : undefined,
      );
    }
  }
}
