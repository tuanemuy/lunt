import { AccountId, NotificationId } from "@repo/core/domain/common/ids";
import { RehydrationError } from "@repo/core/domain/error";
import type { Origin } from "./announcement";
import type { DeliveredOccurrence } from "./delivery";
import { OccurrenceCodec } from "./occurrenceCodec";
import { OccurrenceKey } from "./occurrenceKey";

/**
 * One occurrence delivered to one account (集約ルート). Immutable and
 * unversioned; it stays until the recipient withdraws, whatever happens to
 * the recipient's authority or to what it points at. `occurrenceKey` with
 * `recipient` is unique — `NotificationRepository` guarantees it.
 */
export type Notification = Readonly<{
  id: NotificationId;
  recipient: AccountId;
  occurrenceKey: OccurrenceKey;
  /** When the notification was made; the list's order. */
  createdAt: Date;
}> &
  DeliveredOccurrence;

export type IssueParams = Readonly<{
  id: NotificationId;
  origin: Origin;
  delivered: DeliveredOccurrence;
  recipient: AccountId;
}>;

function issue(params: IssueParams, now: Date): Notification {
  return {
    id: params.id,
    recipient: params.recipient,
    occurrenceKey: OccurrenceKey.of(params.origin, params.delivered.occurrence),
    createdAt: now,
    ...params.delivered,
  };
}

/** A stored notification as the adapter reads it back; `occurrence` is the parsed JSON. */
export type NotificationSnapshot = Readonly<{
  id: string;
  recipient: string;
  occurrenceKey: string;
  occurrence: unknown;
  delivery: string;
  createdAt: Date;
}>;

function reconstruct(input: NotificationSnapshot): Notification {
  try {
    const createdAt = new Date(input.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error("Invalid date");
    return {
      id: NotificationId.create(input.id),
      recipient: AccountId.create(input.recipient),
      occurrenceKey: OccurrenceKey.create(input.occurrenceKey),
      createdAt,
      ...OccurrenceCodec.readDelivered(input.occurrence, input.delivery),
    };
  } catch (error) {
    throw new RehydrationError(
      "Stored notification violates invariants",
      error,
    );
  }
}

export const Notification = { issue, reconstruct };
