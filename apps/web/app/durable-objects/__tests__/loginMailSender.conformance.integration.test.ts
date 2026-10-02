import { env } from "cloudflare:test";
import {
  DevInboxMailTransport,
  DoDevInbox,
} from "@repo/core/adapters/durableObject/devInbox";
import type { LuntStateClient } from "@repo/core/adapters/durableObject/protocol/client";
import { describeLoginMailSenderContract } from "@repo/core/adapters/shared/__conformance__/loginMailSender";
import { MailLoginMailSender } from "@repo/core/adapters/shared/mailLoginMailSender";
import { SmtpMailTransport } from "@repo/core/adapters/smtp/smtpTransport";
import { parseMailFrom } from "@repo/core/application/di/mail";
import { SystemClock } from "@repo/core/application/ports/clock";
import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { describe } from "vitest";

const APP_URL = "http://localhost:3000";
const SETTINGS = { appUrl: APP_URL, siteName: "Lunt", validForMs: 900_000 };

// The development inbox on the real Durable Object.
describeLoginMailSenderContract(
  "development inbox, Durable Object",
  async () => {
    const client = env.LUNT_STATE.get(
      env.LUNT_STATE.idFromName(`mail-${crypto.randomUUID()}`),
    ) as unknown as LuntStateClient;
    const inbox = new DoDevInbox(client);
    return {
      sender: new MailLoginMailSender(
        new DevInboxMailTransport(client, {
          clock: SystemClock,
          idGenerator: UuidV7Generator,
          from: "Lunt <no-reply@lunt.example>",
        }),
        SETTINGS,
      ),
      appUrl: APP_URL,
      recipients: [
        EmailAddress.create("first@example.com"),
        EmailAddress.create("second@example.com"),
      ],
      observe: (to) => inbox.list({ to, limit: 100 }),
    };
  },
);

// Real SMTP (port 465, `cloudflare:sockets`), only with credentials:
// SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, MAIL_FROM and SMTP_TEST_TO (the
// mailbox that receives the test mail) must reach this Workers pool as
// bindings. Only sending is automated; read the mail in SMTP_TEST_TO's
// inbox by hand (docs: the verification procedure in the P1 report).
const smtpEnv = env as unknown as Partial<
  Record<
    | "SMTP_HOST"
    | "SMTP_USERNAME"
    | "SMTP_PASSWORD"
    | "MAIL_FROM"
    | "SMTP_TEST_TO",
    string
  >
>;
const smtpReady =
  smtpEnv.SMTP_HOST !== undefined &&
  smtpEnv.SMTP_USERNAME !== undefined &&
  smtpEnv.SMTP_PASSWORD !== undefined &&
  smtpEnv.MAIL_FROM !== undefined &&
  smtpEnv.SMTP_TEST_TO !== undefined;

describe.skipIf(!smtpReady)("SMTP credentials present", () => {
  describeLoginMailSenderContract(
    "SMTP",
    async () => {
      const from = parseMailFrom(smtpEnv.MAIL_FROM ?? "");
      if (from === null) throw new Error("MAIL_FROM is not a mailbox");
      const to = EmailAddress.create(smtpEnv.SMTP_TEST_TO ?? "");
      return {
        sender: new MailLoginMailSender(
          new SmtpMailTransport({
            host: smtpEnv.SMTP_HOST ?? "",
            port: 465,
            username: smtpEnv.SMTP_USERNAME ?? "",
            password: smtpEnv.SMTP_PASSWORD ?? "",
            from,
          }),
          SETTINGS,
        ),
        appUrl: APP_URL,
        recipients: [to, to],
      };
    },
    { observable: false },
  );
});
