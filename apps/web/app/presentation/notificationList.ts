import type { NotificationView } from "@repo/core/application/notification/listNotifications";
import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { notificationDestinationPath } from "./notificationDestination";
import { headline, refText } from "./notificationText";
import { paginationSchema } from "./pagination";
import { validateInput } from "./validator";

/** One notification as MY-03 lists it. */
export type NotificationItem = Readonly<{
  id: string;
  title: string;
  /** The references and delivery notes, joined for the row's meta line. */
  meta: string;
  /** The screen it opens; `null` when it only informs. */
  href: string | null;
  /** ISO 8601. */
  createdAt: string;
}>;

/** A page of MY-03, with the server's clock to word the times against. */
export type NotificationPage = Readonly<{
  items: readonly NotificationItem[];
  count: number;
  /** ISO 8601. */
  now: string;
}>;

/** Notifications per page (CF-05 loads the next as the list is read). */
export const NOTIFICATION_PAGE_SIZE = 20;

const PROXY_NOTE = "管理者が不在のため、サービス運営者として受け取りました";
const NOWHERE_NOTE = "この通知から開く画面はありません";

/** The words and destination of a notification, as the mail says them. */
export function toNotificationItem(view: NotificationView): NotificationItem {
  const meta = [
    ...view.labels.map(refText),
    ...(view.reassignedTo === null
      ? []
      : [`付け替え先: カテゴリー「${view.reassignedTo.name}」`]),
    ...(view.delivery === "proxy" ? [PROXY_NOTE] : []),
    ...(view.destination === null ? [NOWHERE_NOTE] : []),
  ];
  return {
    id: view.id,
    title: headline(view.occurrence),
    meta: meta.join(" · "),
    href:
      view.destination === null
        ? null
        : notificationDestinationPath(view.destination),
    createdAt: view.createdAt.toISOString(),
  };
}

/** MY-03: a further page of the logged-in account's notifications. */
export const listNotificationsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(paginationSchema))
  .handler(async ({ data }): Promise<NotificationPage> => {
    const { loadNotificationPage } = await import("./notificationListData");
    return loadNotificationPage(data);
  });
