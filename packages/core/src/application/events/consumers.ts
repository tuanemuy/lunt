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

type SubscribedType =
  (typeof consumers)[ConsumerName] extends EventConsumer<infer T> ? T : never;

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
