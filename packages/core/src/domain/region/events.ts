import type {
  DomainEventBase,
  EventDraft,
} from "@repo/core/domain/common/event";
import type { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import type { UnpublishReason } from "@repo/core/domain/common/publication";

/** `unpublish` (`byManager`), or `takeDownPhotos` removing a published region's last photo. */
export type RegionUnpublishedEvent = DomainEventBase<
  "region.unpublished",
  { regionId: RegionId; reason: UnpublishReason }
>;

export type RegionSuspendedEvent = DomainEventBase<
  "region.suspended",
  { regionId: RegionId }
>;

export type RegionUnsuspendedEvent = DomainEventBase<
  "region.unsuspended",
  { regionId: RegionId }
>;

/** An affiliation was established (an affiliation application approved). */
export type AffiliationEstablishedEvent = DomainEventBase<
  "region.affiliation_established",
  { placeId: PlaceId; regionId: RegionId }
>;

export type AffiliationDissolveCause = "left" | "excluded";

/** An affiliation was dissolved: a leave approved (`left`) or an exclusion (`excluded`). */
export type AffiliationDissolvedEvent = DomainEventBase<
  "region.affiliation_dissolved",
  { placeId: PlaceId; regionId: RegionId; cause: AffiliationDissolveCause }
>;

/** Region aggregate events (`aggregateId` is the region's id). */
export type RegionAggregateEvent =
  | RegionUnpublishedEvent
  | RegionSuspendedEvent
  | RegionUnsuspendedEvent;

/** Place affiliation events (`aggregateId` is the place's id). */
export type AffiliationEvent =
  | AffiliationEstablishedEvent
  | AffiliationDissolvedEvent;

/**
 * Every event type Region declares (the shared kernel's
 * `content.photos_taken_down` / `photos.released` are not included).
 */
export type RegionEvent = RegionAggregateEvent | AffiliationEvent;

export const REGION_EVENT_TYPES = [
  "region.unpublished",
  "region.suspended",
  "region.unsuspended",
  "region.affiliation_established",
  "region.affiliation_dissolved",
] as const satisfies readonly RegionEvent["type"][];

export const RegionEvents = {
  unpublished: (
    regionId: RegionId,
    reason: UnpublishReason,
    now: Date,
  ): EventDraft<RegionUnpublishedEvent> => ({
    type: "region.unpublished",
    payload: { regionId, reason },
    occurredAt: now,
    aggregateId: regionId,
  }),
  suspended: (
    regionId: RegionId,
    now: Date,
  ): EventDraft<RegionSuspendedEvent> => ({
    type: "region.suspended",
    payload: { regionId },
    occurredAt: now,
    aggregateId: regionId,
  }),
  unsuspended: (
    regionId: RegionId,
    now: Date,
  ): EventDraft<RegionUnsuspendedEvent> => ({
    type: "region.unsuspended",
    payload: { regionId },
    occurredAt: now,
    aggregateId: regionId,
  }),
  affiliationEstablished: (
    placeId: PlaceId,
    regionId: RegionId,
    now: Date,
  ): EventDraft<AffiliationEstablishedEvent> => ({
    type: "region.affiliation_established",
    payload: { placeId, regionId },
    occurredAt: now,
    aggregateId: placeId,
  }),
  affiliationDissolved: (
    placeId: PlaceId,
    regionId: RegionId,
    cause: AffiliationDissolveCause,
    now: Date,
  ): EventDraft<AffiliationDissolvedEvent> => ({
    type: "region.affiliation_dissolved",
    payload: { placeId, regionId, cause },
    occurredAt: now,
    aggregateId: placeId,
  }),
};
