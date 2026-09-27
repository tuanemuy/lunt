import { env } from "cloudflare:test";
import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import { describeMailerContract } from "@repo/core/adapters/mail/__conformance__/mailer";
import {
  DevInboxMailTransport,
  DoDevInbox,
} from "@repo/core/adapters/mail/devInbox";
import { TransportMailer } from "@repo/core/adapters/mail/mailer";
import { SmtpMailTransport } from "@repo/core/adapters/mail/smtpTransport";
import { parseMailFrom } from "@repo/core/application/di/mail";
import { SystemClock } from "@repo/core/application/ports/clock";
import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { describe } from "vitest";

// The development inbox on the real Durable Object.
describeMailerContract("development inbox, Durable Object", async () => {
  const client = env.LUNT_STATE.get(
    env.LUNT_STATE.idFromName(`mailer-${crypto.randomUUID()}`),
  ) as unknown as LuntStateClient;
  const inbox = new DoDevInbox(client);
  return {
    mailer: new TransportMailer(
      new DevInboxMailTransport(client, {
        clock: SystemClock,
        idGenerator: UuidV7Generator,
        from: "Lunt <no-reply@lunt.example>",
      }),
    ),
    recipients: [
      EmailAddress.create("first@example.com"),
      EmailAddress.create("second@example.com"),
    ],
    observe: (to) => inbox.list({ to, limit: 100 }),
  };
});

// Real SMTP (port 465, `cloudflare:sockets`), only with credentials — the
// same bindings as the login mail's SMTP run (SMTP_HOST, SMTP_USERNAME,
// SMTP_PASSWORD, MAIL_FROM, SMTP_TEST_TO). Only sending is automated; read
// the mails in SMTP_TEST_TO's inbox by hand.
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
  describeMailerContract("SMTP", async () => {
    const from = parseMailFrom(smtpEnv.MAIL_FROM ?? "");
    if (from === null) throw new Error("MAIL_FROM is not a mailbox");
    const to = EmailAddress.create(smtpEnv.SMTP_TEST_TO ?? "");
    return {
      mailer: new TransportMailer(
        new SmtpMailTransport({
          host: smtpEnv.SMTP_HOST ?? "",
          port: 465,
          username: smtpEnv.SMTP_USERNAME ?? "",
          password: smtpEnv.SMTP_PASSWORD ?? "",
          from,
        }),
      ),
      recipients: [to, to],
    };
  });
});
