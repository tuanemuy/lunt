import type {
  DomainEventBase,
  EventDraft,
} from "@repo/core/domain/common/event";
import type {
  CategoryId,
  ListingId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { UnpublishReason } from "@repo/core/domain/common/publication";

/** `unpublish`, or `takeDownPhotos` removing a published listing's last photo. */
export type ListingUnpublishedEvent = DomainEventBase<
  "listing.unpublished",
  { listingId: ListingId; reason: UnpublishReason }
>;

export type ListingSuspendedEvent = DomainEventBase<
  "listing.suspended",
  { listingId: ListingId; placeId: PlaceId }
>;

export type ListingUnsuspendedEvent = DomainEventBase<
  "listing.unsuspended",
  { listingId: ListingId; placeId: PlaceId }
>;

export type ListingDeletedEvent = DomainEventBase<
  "listing.deleted",
  { listingId: ListingId }
>;

/**
 * `OfferingWatch.detect` saw a published listing's offering end (by
 * schedule or by hand — not told apart). `observedOn` is the day it was
 * seen. It may arrive after `listing.deleted` for the same listing.
 */
export type ListingOfferingEndedEvent = DomainEventBase<
  "listing.offering_ended",
  { listingId: ListingId; observedOn: LocalDate }
>;

/** `CategoryCatalog.retire`. `aggregateId` is the category's id. */
export type CategoryRetiredEvent = DomainEventBase<
  "category.retired",
  { categoryId: CategoryId }
>;

/** Listing aggregate events (`aggregateId` is the listing's id). */
export type ListingEvent =
  | ListingUnpublishedEvent
  | ListingSuspendedEvent
  | ListingUnsuspendedEvent
  | ListingDeletedEvent
  | ListingOfferingEndedEvent;

/** Category catalog events. */
export type CategoryEvent = CategoryRetiredEvent;

export const ListingEvents = {
  unpublished: (
    listingId: ListingId,
    reason: UnpublishReason,
    now: Date,
  ): EventDraft<ListingUnpublishedEvent> => ({
    type: "listing.unpublished",
    payload: { listingId, reason },
    occurredAt: now,
    aggregateId: listingId,
  }),
  suspended: (
    listingId: ListingId,
    placeId: PlaceId,
    now: Date,
  ): EventDraft<ListingSuspendedEvent> => ({
    type: "listing.suspended",
    payload: { listingId, placeId },
    occurredAt: now,
    aggregateId: listingId,
  }),
  unsuspended: (
    listingId: ListingId,
    placeId: PlaceId,
    now: Date,
  ): EventDraft<ListingUnsuspendedEvent> => ({
    type: "listing.unsuspended",
    payload: { listingId, placeId },
    occurredAt: now,
    aggregateId: listingId,
  }),
  deleted: (
    listingId: ListingId,
    now: Date,
  ): EventDraft<ListingDeletedEvent> => ({
    type: "listing.deleted",
    payload: { listingId },
    occurredAt: now,
    aggregateId: listingId,
  }),
  offeringEnded: (
    listingId: ListingId,
    observedOn: LocalDate,
    now: Date,
  ): EventDraft<ListingOfferingEndedEvent> => ({
    type: "listing.offering_ended",
    payload: { listingId, observedOn },
    occurredAt: now,
    aggregateId: listingId,
  }),
  categoryRetired: (
    categoryId: CategoryId,
    now: Date,
  ): EventDraft<CategoryRetiredEvent> => ({
    type: "category.retired",
    payload: { categoryId },
    occurredAt: now,
    aggregateId: categoryId,
  }),
};
