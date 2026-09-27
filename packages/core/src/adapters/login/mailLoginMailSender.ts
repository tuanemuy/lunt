import type {
  LinkToken,
  LoginCode,
} from "@repo/core/domain/account/loginSecret";
import type { LoginMailSender } from "@repo/core/domain/account/ports/loginMailSender";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { MailTransport, OutgoingMail } from "../mail/transport";

/**
 * Where the login mail's link lands: the MY-02 route that reads `token`
 * from the query and redeems it (`completeLoginByLink`).
 */
export const LOGIN_LINK_PATH = "/login/link";
export const LOGIN_LINK_TOKEN_PARAM = "token";

/** The absolute URL the login mail links to. */
export function loginLinkUrl(appUrl: string, linkToken: LinkToken): string {
  const url = new URL(LOGIN_LINK_PATH, appUrl);
  url.searchParams.set(LOGIN_LINK_TOKEN_PARAM, linkToken);
  return url.toString();
}

export type LoginMailSettings = Readonly<{
  appUrl: string;
  siteName: string;
  /** How long the link and the code stay usable, for the mail's wording. */
  validForMs: number;
}>;

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The login mail: one mail carrying both the link and the code. */
export function renderLoginMail(
  mail: Readonly<{ to: EmailAddress; linkToken: LinkToken; code: LoginCode }>,
  settings: LoginMailSettings,
): OutgoingMail {
  const url = loginLinkUrl(settings.appUrl, mail.linkToken);
  const minutes = Math.max(1, Math.round(settings.validForMs / 60_000));
  const site = settings.siteName;
  const text = [
    `${site} にログインするには、次のリンクを開くか、ログインの画面でコードを入力してください。`,
    "",
    `リンク: ${url}`,
    `コード: ${mail.code}`,
    "",
    `リンクとコードは ${minutes} 分間使えます。どちらか一方でログインすると、もう一方は使えなくなります。`,
    "リンクを別のブラウザで開くと、そのブラウザでログインします。",
    "",
    "このメールに心当たりがない場合は、何もせずに削除してください。",
  ].join("\n");
  const html = [
    `<p>${escapeHtml(site)} にログインするには、次のリンクを開くか、ログインの画面でコードを入力してください。</p>`,
    `<p><a href="${escapeHtml(url)}">${escapeHtml(site)} にログインする</a></p>`,
    `<p>コード: <strong style="font-size:1.4em;letter-spacing:0.2em">${escapeHtml(mail.code)}</strong></p>`,
    `<p>リンクとコードは ${minutes} 分間使えます。どちらか一方でログインすると、もう一方は使えなくなります。リンクを別のブラウザで開くと、そのブラウザでログインします。</p>`,
    "<p>このメールに心当たりがない場合は、何もせずに削除してください。</p>",
  ].join("\n");
  return {
    to: mail.to,
    subject: `${site} へのログイン`,
    text,
    html,
  };
}

/**
 * `LoginMailSender` over a `MailTransport`: renders the mail and hands it
 * over. Resolves when the transport accepts it. Errors come from the
 * transport, whose messages never include the mail (and so no secret).
 */
export class MailLoginMailSender implements LoginMailSender {
  constructor(
    private readonly transport: MailTransport,
    private readonly settings: LoginMailSettings,
  ) {}

  send(
    mail: Readonly<{ to: EmailAddress; linkToken: LinkToken; code: LoginCode }>,
  ): Promise<void> {
    return this.transport.send(renderLoginMail(mail, this.settings));
  }
}

/**
 * The link token and the code a rendered login mail's text carries — for
 * tests and the development inbox, which read mails the way a person
 * would.
 */
export function readLoginMail(
  text: string,
  appUrl: string,
): Readonly<{
  linkUrl: string | null;
  linkToken: string | null;
  code: string | null;
}> {
  const prefix = new URL(LOGIN_LINK_PATH, appUrl).toString();
  const linkUrl =
    text.split(/\s+/).find((word) => word.startsWith(`${prefix}?`)) ?? null;
  const linkToken =
    linkUrl === null
      ? null
      : new URL(linkUrl).searchParams.get(LOGIN_LINK_TOKEN_PARAM);
  const code = /コード: (\S+)/.exec(text)?.[1] ?? null;
  return { linkUrl, linkToken, code };
}
