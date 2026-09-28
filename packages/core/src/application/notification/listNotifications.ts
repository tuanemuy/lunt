import type { Actor } from "@repo/core/domain/common/actor";
import type { CategoryId, NotificationId } from "@repo/core/domain/common/ids";
import {
  Pagination,
  type PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { ContentRef, StewardedRef } from "@repo/core/domain/common/refs";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import {
  DeliveredOccurrence,
  type Delivery,
} from "@repo/core/domain/notification/delivery";
import { NotificationDestination } from "@repo/core/domain/notification/destination";
import type { RefLabel } from "@repo/core/domain/notification/mail";
import {
  type Occurrence,
  Occurrence as Occurrences,
} from "@repo/core/domain/notification/occurrence";
import type { RequestContainer } from "../di/types";
import { UnauthorizedError } from "../errors";
import { labelsOf, readRepositoryLabels, resolveLabels } from "./labels";

export type ListNotificationsInput = Readonly<{ pagination: Pagination }>;

/** The category a retired one's listings now read as, at display time. */
export type ReassignedCategory = Readonly<{ id: CategoryId; name: string }>;

/** One notification as MY-03 shows it. */
export type NotificationView = Readonly<{
  id: NotificationId;
  occurrence: Occurrence;
  delivery: Delivery;
  createdAt: Date;
  /** What the occurrence points at (`Occurrence.pointedContent`). */
  pointedContent: ContentRef | null;
  /** The target without stewards a `proxy` delivery stood in for. */
  vacantTarget: StewardedRef | null;
  /** The occurrence's references with their names, `null` when gone. */
  labels: readonly RefLabel[];
  /** Where it opens (`NotificationDestination.of`); `null`: nowhere. */
  destination: NotificationDestination | null;
  /**
   * `categories_reassigned` only: the category the retired one resolves to
   * now (`CategoryCatalog.resolve`); `null` for every other occurrence.
   */
  reassignedTo: ReassignedCategory | null;
}>;

export type ListNotificationsOutput = PaginationResult<NotificationView>;

/**
 * The active category a `categories_reassigned` occurrence's retired
 * category resolves to at display time. A retired category never leaves
 * the catalog, so it resolves; an unlisted id reads as `null` rather than
 * failing the whole list.
 */
function reassignedTo(
  o: Occurrence,
  catalog: CategoryCatalog | null,
): ReassignedCategory | null {
  if (
    o.to !== "placeStewards" ||
    o.subject.kind !== "place" ||
    o.subject.matter.kind !== "categories_reassigned" ||
    catalog === null
  ) {
    return null;
  }
  const active = CategoryCatalog.resolveOrNull(
    catalog,
    o.subject.matter.retiredCategoryId,
  );
  return active === null ? null : { id: active.id, name: active.name };
}

/**
 * The signed-in account's notifications, newest first (ACC-03, APP-05 /
 * MY-03) — every authority's and role's notifications in one list, none
 * filtered by kind, delivery, viewability or whether the recipient still
 * holds the authority. Names are resolved whether viewers can see the
 * target or not.
 *
 * Errors: `UnauthorizedError` `LOGIN_REQUIRED` without an actor.
 */
export async function listNotifications({
  container,
  actor,
  input,
}: Readonly<{
  container: RequestContainer;
  actor: Actor | null;
  input: ListNotificationsInput;
}>): Promise<ListNotificationsOutput> {
  if (actor === null) {
    throw new UnauthorizedError("LOGIN_REQUIRED", "Login required");
  }
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const page = await ctx.notificationRepository.findByRecipient(
      actor.accountId,
      Pagination.create(input.pagination),
    );
    const labels = await readRepositoryLabels(
      ctx,
      page.items.map((notification) => notification.occurrence),
    );
    return { page, labels };
  });
  const book = await resolveLabels(container.contentDirectory, read.labels);
  return {
    items: read.page.items.map(
      (notification): NotificationView => ({
        id: notification.id,
        occurrence: notification.occurrence,
        delivery: notification.delivery,
        createdAt: notification.createdAt,
        pointedContent: Occurrences.pointedContent(notification.occurrence),
        vacantTarget: DeliveredOccurrence.vacantTarget(notification),
        labels: labelsOf(notification.occurrence, book),
        destination: NotificationDestination.of(notification),
        reassignedTo: reassignedTo(
          notification.occurrence,
          read.labels.catalog,
        ),
      }),
    ),
    count: read.page.count,
  };
}
