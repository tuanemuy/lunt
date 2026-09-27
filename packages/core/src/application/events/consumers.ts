import type { RequestContainer } from "../di/types";
import type { LuntDomainEvent, LuntEventType } from "./registry";

/**
 * A consumer usecase and the event types it subscribes to. The relay
 * sends one queue message per (event, consumer) pair, so each consumer
 * is retried — and dead-lettered — independently of the others that
 * received the same event.
 */
export type EventConsumer<TType extends LuntEventType = LuntEventType> =
  Readonly<{
    events: readonly TType[];
    handle(
      container: RequestContainer,
      event: Extract<LuntDomainEvent, { type: TType }>,
    ): Promise<void>;
  }>;

export function defineConsumer<const TType extends LuntEventType>(
  events: readonly [TType, ...TType[]],
  handle: EventConsumer<TType>["handle"],
): EventConsumer<TType> {
  return { events, handle };
}

/**
 * Registered consumers, keyed by the consumer usecase's name. The name
 * travels in the queue message and keys the consumer's idempotency
 * receipts, so renaming a consumer is a data migration.
 */
export const consumers = {} satisfies Readonly<Record<string, EventConsumer>>;

export type ConsumerName = keyof typeof consumers & string;

/**
 * Consumers `spec/flows/index.md` 「ドメインイベントと消費者」 names that
 * land with a later stage (`spec/domains/index.md` 「開発の順序との対応」),
 * with the events they will subscribe to. Listing them keeps the
 * coverage check below honest while a stage is partial: an event whose
 * only consumers are listed here is relayed to nobody until the consumer
 * is registered, and the entry is removed as it moves to `consumers`.
 */
export const deferredConsumers = {
  deliverNotifications: {
    events: [
      "authority.invitation_issued",
      "authority.steward_appointed",
      "authority.steward_removed",
      "authority.role_granted",
      "authority.role_revoked",
    ],
    stage: "S1-NTF",
  },
  purgeNotificationsOnWithdrawal: {
    events: ["account.withdrawn"],
    stage: "S1-NTF",
  },
  withdrawApplicationsOfWithdrawnAccount: {
    events: ["account.withdrawn"],
    stage: "S2B",
  },
  purgeBookmarksOnWithdrawal: {
    events: ["account.withdrawn"],
    stage: "S4",
  },
  reassessApplicationPremises: {
    events: ["authority.steward_appointed", "authority.stewardship_vacated"],
    stage: "S2B",
  },
} as const satisfies Readonly<
  Record<string, Readonly<{ events: readonly LuntEventType[]; stage: string }>>
>;

type DeferredConsumerName = keyof typeof deferredConsumers;

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
