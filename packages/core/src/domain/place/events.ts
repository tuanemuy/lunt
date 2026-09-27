import type {
  DomainEventBase,
  EventDraft,
} from "@repo/core/domain/common/event";
import type { PlaceId } from "@repo/core/domain/common/ids";
import type { OperatingStatus } from "./operatingStatus";

/** 営業状況が変わった (`changeOperatingStatus`, `applyRevision`). */
export type PlaceOperatingStatusChangedEvent = DomainEventBase<
  "place.operating_status_changed",
  { placeId: PlaceId; from: OperatingStatus; to: OperatingStatus }
>;

/** 店舗が非公開になった (`suspendPlace`). */
export type PlaceSuspendedEvent = DomainEventBase<
  "place.suspended",
  { placeId: PlaceId }
>;

/** 店舗の非公開が解除された (`unsuspendPlace`). */
export type PlaceUnsuspendedEvent = DomainEventBase<
  "place.unsuspended",
  { placeId: PlaceId }
>;

/**
 * Place's own events. Place also drafts the shared kernel's
 * `photos.released` and `content.photos_taken_down`, which belong to the
 * shared kernel's union, not this one. `aggregateId` is the `PlaceId`.
 */
export type PlaceEvent =
  | PlaceOperatingStatusChangedEvent
  | PlaceSuspendedEvent
  | PlaceUnsuspendedEvent;

export const PLACE_EVENT_TYPES = [
  "place.operating_status_changed",
  "place.suspended",
  "place.unsuspended",
] as const satisfies readonly PlaceEvent["type"][];

export const PlaceEvents = {
  operatingStatusChanged: (
    placeId: PlaceId,
    from: OperatingStatus,
    to: OperatingStatus,
    now: Date,
  ): EventDraft<PlaceOperatingStatusChangedEvent> => ({
    type: "place.operating_status_changed",
    payload: { placeId, from, to },
    occurredAt: now,
    aggregateId: placeId,
  }),
  suspended: (
    placeId: PlaceId,
    now: Date,
  ): EventDraft<PlaceSuspendedEvent> => ({
    type: "place.suspended",
    payload: { placeId },
    occurredAt: now,
    aggregateId: placeId,
  }),
  unsuspended: (
    placeId: PlaceId,
    now: Date,
  ): EventDraft<PlaceUnsuspendedEvent> => ({
    type: "place.unsuspended",
    payload: { placeId },
    occurredAt: now,
    aggregateId: placeId,
  }),
};
