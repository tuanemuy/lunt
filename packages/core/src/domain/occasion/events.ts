import type {
  DomainEventBase,
  EventDraft,
} from "@repo/core/domain/common/event";
import type {
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { UnpublishReason } from "@repo/core/domain/common/publication";

/** `updateContent` changed the holding period (延期). */
export type OccasionPeriodChangedEvent = DomainEventBase<
  "occasion.period_changed",
  { occasionId: OccasionId }
>;

/** `unpublish`, or `takeDownPhotos` removing a published occasion's last photo. */
export type OccasionUnpublishedEvent = DomainEventBase<
  "occasion.unpublished",
  { occasionId: OccasionId; reason: UnpublishReason }
>;

export type OccasionCancelledEvent = DomainEventBase<
  "occasion.cancelled",
  { occasionId: OccasionId }
>;

/**
 * The daily job saw the holding status turn `ended` (`observedOn` is that
 * day). Two concurrent jobs may emit it twice; consumers are idempotent.
 */
export type OccasionEndedEvent = DomainEventBase<
  "occasion.ended",
  { occasionId: OccasionId; observedOn: LocalDate }
>;

export type OccasionSuspendedEvent = DomainEventBase<
  "occasion.suspended",
  { occasionId: OccasionId }
>;

export type OccasionUnsuspendedEvent = DomainEventBase<
  "occasion.unsuspended",
  { occasionId: OccasionId }
>;

/** `aggregateId` is `ParticipationKey.toString(key)`. */
export type ParticipationEstablishedEvent = DomainEventBase<
  "occasion.participation_established",
  { occasionId: OccasionId; placeId: PlaceId }
>;

export type ParticipationChangedBy = "place" | "occasion";

export type ParticipationChangedEvent = DomainEventBase<
  "occasion.participation_changed",
  {
    occasionId: OccasionId;
    placeId: PlaceId;
    changedBy: ParticipationChangedBy;
  }
>;

export type ParticipationDissolveCause = "withdrawn" | "excluded";

export type ParticipationDissolvedEvent = DomainEventBase<
  "occasion.participation_dissolved",
  {
    occasionId: OccasionId;
    placeId: PlaceId;
    cause: ParticipationDissolveCause;
  }
>;

/** `aggregateId` is `RegionLinkKey.toString(key)`. */
export type RegionLinkedEvent = DomainEventBase<
  "occasion.region_linked",
  { occasionId: OccasionId; regionId: RegionId }
>;

export type RegionLinkDetachedEvent = DomainEventBase<
  "occasion.region_link_detached",
  { occasionId: OccasionId; regionId: RegionId }
>;

/** Occasion's own events (the shared-kernel photo events are not listed). */
export type OccasionEvent =
  | OccasionPeriodChangedEvent
  | OccasionUnpublishedEvent
  | OccasionCancelledEvent
  | OccasionEndedEvent
  | OccasionSuspendedEvent
  | OccasionUnsuspendedEvent
  | ParticipationEstablishedEvent
  | ParticipationChangedEvent
  | ParticipationDissolvedEvent
  | RegionLinkedEvent
  | RegionLinkDetachedEvent;

export type OccasionEventType = OccasionEvent["type"];

/** `"{occasionId}:{placeId}"` — a participation's `aggregateId`. */
export const participationAggregateId = (
  occasionId: OccasionId,
  placeId: PlaceId,
): string => `${occasionId}:${placeId}`;

/** `"{occasionId}:{regionId}"` — a region link's `aggregateId`. */
export const regionLinkAggregateId = (
  occasionId: OccasionId,
  regionId: RegionId,
): string => `${occasionId}:${regionId}`;

const occasionDraft = <
  T extends
    | "occasion.period_changed"
    | "occasion.cancelled"
    | "occasion.suspended"
    | "occasion.unsuspended",
>(
  type: T,
  occasionId: OccasionId,
  now: Date,
) => ({
  type,
  payload: { occasionId },
  occurredAt: now,
  aggregateId: occasionId,
});

export const OccasionEvents = {
  periodChanged: (
    occasionId: OccasionId,
    now: Date,
  ): EventDraft<OccasionPeriodChangedEvent> =>
    occasionDraft("occasion.period_changed", occasionId, now),
  unpublished: (
    occasionId: OccasionId,
    reason: UnpublishReason,
    now: Date,
  ): EventDraft<OccasionUnpublishedEvent> => ({
    type: "occasion.unpublished",
    payload: { occasionId, reason },
    occurredAt: now,
    aggregateId: occasionId,
  }),
  cancelled: (
    occasionId: OccasionId,
    now: Date,
  ): EventDraft<OccasionCancelledEvent> =>
    occasionDraft("occasion.cancelled", occasionId, now),
  ended: (
    occasionId: OccasionId,
    observedOn: LocalDate,
    now: Date,
  ): EventDraft<OccasionEndedEvent> => ({
    type: "occasion.ended",
    payload: { occasionId, observedOn },
    occurredAt: now,
    aggregateId: occasionId,
  }),
  suspended: (
    occasionId: OccasionId,
    now: Date,
  ): EventDraft<OccasionSuspendedEvent> =>
    occasionDraft("occasion.suspended", occasionId, now),
  unsuspended: (
    occasionId: OccasionId,
    now: Date,
  ): EventDraft<OccasionUnsuspendedEvent> =>
    occasionDraft("occasion.unsuspended", occasionId, now),
  participationEstablished: (
    occasionId: OccasionId,
    placeId: PlaceId,
    now: Date,
  ): EventDraft<ParticipationEstablishedEvent> => ({
    type: "occasion.participation_established",
    payload: { occasionId, placeId },
    occurredAt: now,
    aggregateId: participationAggregateId(occasionId, placeId),
  }),
  participationChanged: (
    occasionId: OccasionId,
    placeId: PlaceId,
    changedBy: ParticipationChangedBy,
    now: Date,
  ): EventDraft<ParticipationChangedEvent> => ({
    type: "occasion.participation_changed",
    payload: { occasionId, placeId, changedBy },
    occurredAt: now,
    aggregateId: participationAggregateId(occasionId, placeId),
  }),
  participationDissolved: (
    occasionId: OccasionId,
    placeId: PlaceId,
    cause: ParticipationDissolveCause,
    now: Date,
  ): EventDraft<ParticipationDissolvedEvent> => ({
    type: "occasion.participation_dissolved",
    payload: { occasionId, placeId, cause },
    occurredAt: now,
    aggregateId: participationAggregateId(occasionId, placeId),
  }),
  regionLinked: (
    occasionId: OccasionId,
    regionId: RegionId,
    now: Date,
  ): EventDraft<RegionLinkedEvent> => ({
    type: "occasion.region_linked",
    payload: { occasionId, regionId },
    occurredAt: now,
    aggregateId: regionLinkAggregateId(occasionId, regionId),
  }),
  regionLinkDetached: (
    occasionId: OccasionId,
    regionId: RegionId,
    now: Date,
  ): EventDraft<RegionLinkDetachedEvent> => ({
    type: "occasion.region_link_detached",
    payload: { occasionId, regionId },
    occurredAt: now,
    aggregateId: regionLinkAggregateId(occasionId, regionId),
  }),
};
