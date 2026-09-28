import type { AccountEvent } from "@repo/core/domain/account/events";
import type { ApplicationEvent } from "@repo/core/domain/application/events";
import type { AuthorityEvent } from "@repo/core/domain/authority/events";
import type { EventDecoder } from "@repo/core/domain/common/event";
import type {
  PhotosReleasedEvent,
  PhotosTakenDownEvent,
} from "@repo/core/domain/common/photoEvents";
import type {
  CategoryEvent,
  ListingEvent,
} from "@repo/core/domain/listing/events";
import type { ModerationEvent } from "@repo/core/domain/moderation/events";
import type { PlaceEvent } from "@repo/core/domain/place/events";
import { accountEventDecoders } from "../account/eventDecoders";
import { applicationEventDecoders } from "../application/eventDecoders";
import { authorityEventDecoders } from "../authority/eventDecoders";
import { listingEventDecoders } from "../listing/eventDecoders";
import { photoEventDecoders } from "../media/eventDecoders";
import {
  contentPhotoEventDecoders,
  moderationEventDecoders,
} from "../moderation/eventDecoders";
import { placeEventDecoders } from "../place/eventDecoders";

/**
 * Every domain event Lunt persists to the outbox. A type joins this
 * union together with its decoder (below) and its consumers
 * (`./consumers.ts`) — the relay refuses to deliver an event it cannot
 * decode, and every event must have at least one consumer
 * (`spec/flows/index.md` 「ドメインイベントと消費者」).
 */
export type LuntDomainEvent =
  | AccountEvent
  | AuthorityEvent
  | ApplicationEvent
  | PhotosReleasedEvent
  | PlaceEvent
  | ListingEvent
  | CategoryEvent
  | ModerationEvent
  | PhotosTakenDownEvent;

export type LuntEventType = LuntDomainEvent["type"];

export type DefaultEventDecoderRegistry = {
  readonly [K in LuntEventType]: EventDecoder<
    Extract<LuntDomainEvent, { type: K }>
  >;
};

/**
 * Caller-supplied registries are scoped to the closed `LuntDomainEvent`
 * set so an unknown key (a typo or a stale event name) cannot slip past
 * the type fence.
 */
export type EventDecoderRegistry = Partial<DefaultEventDecoderRegistry>;

export const eventDecoders = {
  ...accountEventDecoders,
  ...authorityEventDecoders,
  ...applicationEventDecoders,
  ...photoEventDecoders,
  ...placeEventDecoders,
  ...listingEventDecoders,
  ...moderationEventDecoders,
  ...contentPhotoEventDecoders,
} satisfies DefaultEventDecoderRegistry;
