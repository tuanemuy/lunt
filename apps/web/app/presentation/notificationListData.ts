// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { getContainer } from "@repo/core/application/di/containerStore";
import { listNotifications } from "@repo/core/application/notification/listNotifications";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { resolveActor } from "./actor";
import { type NotificationPage, toNotificationItem } from "./notificationList";

/** A page of the logged-in account's notifications, newest first. */
export async function loadNotificationPage(
  pagination: Pagination,
): Promise<NotificationPage> {
  const container = await getContainer();
  const actor = await resolveActor(container);
  const { items, count } = await listNotifications({
    container,
    actor,
    input: { pagination },
  });
  return {
    items: items.map(toNotificationItem),
    count,
    now: container.clock.now().toISOString(),
  };
}
