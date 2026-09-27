import type { AccountId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { Notification } from "../notification";

/**
 * The notifications delivered to accounts (`spec/domains/notification.md`
 * 「NotificationRepository」). Notifications never change and every write is
 * idempotent, so there is no optimistic lock; no method answers
 * `ConflictError` or `NotFoundError`.
 *
 * - `deliverAll`: adds each notification unless one with the same
 *   `occurrenceKey` and `recipient` exists — then the existing one (its `id`
 *   and `createdAt`) stays. The port guarantees that uniqueness, concurrent
 *   writers included; callers never search first. All or nothing within a
 *   unit of work. An empty list does nothing.
 * - `removeAllByRecipient`: deletes all of the account's notifications;
 *   repeating it changes nothing.
 * - `findByRecipient`: the account's notifications, newest `createdAt`
 *   first, ties by `id` ascending; `count` is the account's total. No
 *   filtering by kind, delivery or whether the target can be viewed.
 *
 * Neither the recipient nor what an occurrence points at has to exist.
 */
export interface NotificationRepository {
  deliverAll(notifications: readonly Notification[]): Promise<void>;
  removeAllByRecipient(recipient: AccountId): Promise<void>;
  findByRecipient(
    recipient: AccountId,
    pagination: Pagination,
  ): Promise<PaginationResult<Notification>>;
}
