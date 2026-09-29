import { reassessApplicationPremises } from "../application/reassessApplicationPremises";
import { withdrawApplicationsOfWithdrawnAccount } from "../application/withdrawApplicationsOfWithdrawnAccount";
import { discardReleasedPhotos } from "../media/discardReleasedPhotos";
import { deliverNotifications } from "../notification/deliverNotifications";
import { purgeNotificationsOnWithdrawal } from "../notification/purgeNotificationsOnWithdrawal";
import { sendTakedownOutcome } from "../notification/sendTakedownOutcome";
import type { EventConsumer } from "./consumer";
import type { LuntEventType } from "./registry";

export type { EventConsumer } from "./consumer";

/**
 * Registered consumers, keyed by the consumer usecase's name. The name
 * travels in the queue message and keys the consumer's idempotency
 * receipts, so renaming a consumer is a data migration.
 */
export const consumers = {
  deliverNotifications,
  discardReleasedPhotos,
  purgeNotificationsOnWithdrawal,
  reassessApplicationPremises,
  sendTakedownOutcome,
  withdrawApplicationsOfWithdrawnAccount,
} satisfies Readonly<Record<string, EventConsumer>>;

export type ConsumerName = keyof typeof consumers & string;

/**
 * Consumers `spec/flows/index.md` 「ドメインイベントと消費者」 names that
 * land with a later stage (`spec/domains/index.md` 「開発の順序との対応」),
 * with the events they will subscribe to. Listing them keeps the
 * coverage check below honest while a stage is partial: an event whose
 * only consumers are listed here is relayed to nobody until the consumer
 * is registered, and the entry is removed as it moves to `consumers`. An
 * entry named `<consumer>@<stage>` lists the events a registered consumer
 * takes on in that later stage (it is removed when they join the
 * consumer's own list).
 */
export const deferredConsumers = {
  purgeBookmarksOnWithdrawal: {
    events: ["account.withdrawn"],
    stage: "S4",
  },
  "reassessApplicationPremises@S3B": {
    events: [
      "region.affiliation_established",
      "region.affiliation_dissolved",
      "occasion.participation_established",
      "occasion.cancelled",
      "occasion.ended",
      "occasion.period_changed",
    ],
    stage: "S3B",
  },
  "deliverNotifications@S3B-NTF": {
    events: [
      "region.unpublished",
      "region.suspended",
      "region.unsuspended",
      "region.affiliation_dissolved",
      "occasion.period_changed",
      "occasion.unpublished",
      "occasion.cancelled",
      "occasion.ended",
      "occasion.suspended",
      "occasion.unsuspended",
      "occasion.participation_changed",
      "occasion.participation_dissolved",
      "occasion.region_linked",
      "occasion.region_link_detached",
    ],
    stage: "S3B-NTF",
  },
} as const satisfies Readonly<
  Record<string, Readonly<{ events: readonly LuntEventType[]; stage: string }>>
>;

type DeferredConsumerName = keyof typeof deferredConsumers;

/**
 * Event types a later stage's consumer will subscribe to. While no
 * registered consumer subscribes to one, the relay marks it processed
 * without a message (`createFanOutDispatcher`): the stage that brings the
 * consumer starts from the events stored after it lands, the same as
 * for any consumer added to a running system.
 */
export const awaitingLaterStage: ReadonlySet<string> = new Set(
  Object.values(deferredConsumers).flatMap(
    (entry): readonly string[] => entry.events,
  ),
);

const noConsumerIsBothRegisteredAndDeferred: [
  Extract<ConsumerName, DeferredConsumerName>,
] extends [never]
  ? true
  : Extract<ConsumerName, DeferredConsumerName> = true;
void noConsumerIsBothRegisteredAndDeferred;

// Mapped per name: with no consumer registered, a bare
// `(typeof consumers)[never] extends EventConsumer<infer T>` would infer
// `T` as its constraint and count every event as subscribed.
type SubscribedType =
  | {
      [K in ConsumerName]: (typeof consumers)[K] extends EventConsumer<infer T>
        ? T
        : never;
    }[ConsumerName]
  | (typeof deferredConsumers)[DeferredConsumerName]["events"][number];

/** Event types no consumer subscribes to — must stay empty. */
export type UnsubscribedEventType = Exclude<LuntEventType, SubscribedType>;

const everyEventHasAConsumer: [UnsubscribedEventType] extends [never]
  ? true
  : UnsubscribedEventType = true;
void everyEventHasAConsumer;

export type ConsumerRegistry = Readonly<
  Record<string, EventConsumer | undefined>
>;

/** Consumer names subscribed to `type`, in registry order. */
export function subscribersOf(
  registry: ConsumerRegistry,
  type: string,
): readonly string[] {
  return Object.entries(registry)
    .filter(([, consumer]) =>
      (consumer?.events as readonly string[] | undefined)?.includes(type),
    )
    .map(([name]) => name);
}
