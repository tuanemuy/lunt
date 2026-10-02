import {
  DevInboxMailTransport,
  DoDevInbox,
} from "@repo/core/adapters/durableObject/devInbox";
import type { MailTransport } from "@repo/core/adapters/shared/mailTransport";
import { SmtpMailTransport } from "@repo/core/adapters/smtp/smtpTransport";
import { z } from "zod";
import type { DevInbox } from "../dev/devInbox";
import type { ServiceDeps } from "./serviceDeps";

/**
 * Mail delivery settings, shared by every domain that sends mail (Account's
 * login mail, Notification's mails) — one transport per deployment.
 */
export type MailEnv = Readonly<{
  /** `devInbox` (default; development tools only) or `smtp`. */
  MAIL_TRANSPORT?: string | undefined;
  /** Sender, `Name <address>` or `address`. Required for `smtp`. */
  MAIL_FROM?: string | undefined;
  SMTP_HOST?: string | undefined;
  /** Only 465 (implicit TLS) is supported. */
  SMTP_PORT?: string | undefined;
  SMTP_USERNAME?: string | undefined;
  /** Secret: `wrangler secret put SMTP_PASSWORD`. */
  SMTP_PASSWORD?: string | undefined;
}>;

export const DEV_MAIL_FROM = "Lunt <no-reply@lunt.example>";

const MAILBOX = /^\s*(?:(.*?)\s*<([^<>\s]+@[^<>\s]+)>|([^<>\s]+@[^<>\s]+))\s*$/;

export type MailFrom = Readonly<{ email: string; name?: string | undefined }>;

/** `Name <address>` or a bare address; `null` when it is neither. */
export function parseMailFrom(raw: string): MailFrom | null {
  const match = MAILBOX.exec(raw);
  if (match === null) return null;
  const email = match[2] ?? match[3];
  if (email === undefined) return null;
  const name = match[1]?.replace(/^"|"$/g, "").trim();
  return name === undefined || name.length === 0 ? { email } : { name, email };
}

const mailFrom = z.string().transform((raw, ctx) => {
  const parsed = parseMailFrom(raw);
  if (parsed === null) {
    ctx.addIssue({ code: "custom", message: "MAIL_FROM is not a mailbox" });
    return z.NEVER;
  }
  return parsed;
});

const mailSchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("devInbox"),
    from: mailFrom,
  }),
  z.object({
    transport: z.literal("smtp"),
    from: mailFrom,
    host: z.string().min(1),
    port: z.literal("465").default("465"),
    username: z.string().min(1),
    password: z.string().min(1),
  }),
]);

export type MailSettings =
  | Readonly<{ transport: "devInbox"; from: MailFrom }>
  | Readonly<{
      transport: "smtp";
      from: MailFrom;
      host: string;
      port: 465;
      username: string;
      password: string;
    }>;

/**
 * Reads and checks the mail settings. The development inbox is refused
 * unless the development tools are on, so a deployment cannot silently
 * swallow its mail.
 */
export function readMailSettings(
  env: MailEnv,
  devTools: boolean,
): MailSettings {
  const transport = env.MAIL_TRANSPORT ?? "devInbox";
  const parsed = mailSchema.parse({
    transport,
    from:
      env.MAIL_FROM ?? (transport === "devInbox" ? DEV_MAIL_FROM : undefined),
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    username: env.SMTP_USERNAME,
    password: env.SMTP_PASSWORD,
  });
  if (parsed.transport === "devInbox") {
    if (!devTools) {
      throw new Error(
        "MAIL_TRANSPORT=devInbox needs DEV_TOOLS=1; set MAIL_TRANSPORT=smtp",
      );
    }
    return parsed;
  }
  return { ...parsed, port: 465 };
}

const formatFrom = (from: MailFrom): string =>
  from.name === undefined ? from.email : `${from.name} <${from.email}>`;

/** The deployment's mail transport, and the development inbox if it is one. */
export function createMailTransport(
  settings: MailSettings,
  deps: ServiceDeps,
): Readonly<{ transport: MailTransport; devInbox: DevInbox | null }> {
  if (settings.transport === "devInbox") {
    return {
      transport: new DevInboxMailTransport(deps.client, {
        clock: deps.shared.clock,
        idGenerator: deps.shared.idGenerator,
        from: formatFrom(settings.from),
      }),
      devInbox: new DoDevInbox(deps.client),
    };
  }
  return {
    transport: new SmtpMailTransport({
      host: settings.host,
      port: settings.port,
      username: settings.username,
      password: settings.password,
      from: settings.from,
    }),
    devInbox: null,
  };
}
