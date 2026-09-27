import { NOTIFICATION_PAGE_SIZE } from "@/presentation/notificationList";
import { loadNotificationPage } from "@/presentation/notificationListData";
import { NotificationList } from "../NotificationList";

/** MY-03's first page, rendered on the server; the list loads the rest. */
export async function NotificationsContent() {
  const first = await loadNotificationPage({
    page: 1,
    limit: NOTIFICATION_PAGE_SIZE,
  });
  return <NotificationList first={first} />;
}
