import type { NotificationMailSettings } from "@repo/core/application/di/presentationPorts";
import { NotificationDestination } from "@repo/core/domain/notification/destination";
import type {
  NotificationMail,
  RenderedMail,
  TakedownOutcomeMail,
} from "@repo/core/domain/notification/mail";
import type { NotificationMailRenderer } from "@repo/core/domain/notification/ports/notificationMailRenderer";
import { notificationDestinationUrl } from "./notificationDestination";
import { headline, refText } from "./notificationText";

const pad = (n: number): string => String(n).padStart(2, "0");

/** `YYYY/MM/DD HH:mm` in Japan time, independent of the runtime's zone. */
function japanTime(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}/${pad(jst.getUTCMonth() + 1)}/${pad(jst.getUTCDate())} ${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`;
}

/**
 * Notification's `NotificationMailRenderer`: Japanese plain-text mails in
 * the product's tone. The link is the destination's URL under `appUrl`
 * (`notificationDestination.ts`, the same mapping MY-03 opens). A retired
 * category's successor is never mentioned.
 */
export function createNotificationMailRenderer(
  settings: NotificationMailSettings,
): NotificationMailRenderer {
  const site = settings.siteName;
  const listUrl = new URL("/me/notifications", settings.appUrl).toString();
  return {
    render(mail: NotificationMail): RenderedMail {
      const link = NotificationDestination.of(mail);
      const title = headline(mail.occurrence);
      const body = [
        `${title}。`,
        "",
        ...mail.labels.map((label) => `・${refText(label)}`),
        ...(mail.delivery === "proxy"
          ? [
              "",
              "管理者が不在のため、サービス運営者としてこの通知を受け取っています。",
            ]
          : []),
        ...(link === null
          ? []
          : [
              "",
              "次のリンクから確かめられます。",
              notificationDestinationUrl(settings.appUrl, link),
            ]),
        // An invitation may go to an address without an account, which
        // has no in-app notification to point at.
        ...(mail.occurrence.to === "invitee"
          ? []
          : ["", `同じ通知は ${site} の通知一覧でも確かめられます。`, listUrl]),
      ].join("\n");
      return { to: mail.key.to, subject: `【${site}】${title}`, body, link };
    },
    renderTakedownOutcome(mail: TakedownOutcomeMail): RenderedMail {
      const target = refText({
        ref: mail.target.ref,
        label: mail.target.label,
      });
      const body = [
        `${site} にお送りいただいた取り下げの申立てについて、対応を終えましたのでお知らせします。`,
        "",
        `・申立ての対象: ${target}`,
        `・受け付けた日時: ${japanTime(mail.receivedAt)}（日本時間）`,
        "",
        "対応の結果:",
        mail.outcome,
        "",
        "このメールは送信専用です。",
      ].join("\n");
      return {
        to: mail.key.to,
        subject: `【${site}】取り下げの申立てへの対応について`,
        body,
        link: null,
      };
    },
  };
}
