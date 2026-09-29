import type { DomainEvent } from "@repo/core/domain/common/event";
import type { RequestContainer } from "../di/types";
import { type ConsumerRegistry, subscribersOf } from "../events/consumers";
import { type EventDecoderRegistry, eventDecoders } from "../events/registry";
import type { ConsumerReceipts } from "../ports/consumerReceipts";
import {
  decodeStoredEvent,
  type EventDispatcher,
  type EventDispatchOutcome,
} from "./eventRelayWorker";

/** One queue message: one event addressed to one consumer. */
export type EventMessage = Readonly<{
  consumer: string;
  event: DomainEvent;
}>;

/** Cloudflare Queues accepts at most 100 messages per `sendBatch`. */
export const MAX_MESSAGES_PER_BATCH = 100;

/**
 * Builds the relay's dispatcher: each event is expanded into one message
 * per subscribed consumer and sent in batches. An event counts as
 * delivered only when every batch carrying one of its messages was
 * accepted; a partially delivered event is retried whole, and the
 * consumers that already received it skip it through their receipts.
 *
 * An event no registered consumer subscribes to fails (and is retried)
 * unless its type is in `awaiting` — types only a later stage's consumer
 * subscribes to (`awaitingLaterStage`), which are delivered to nobody and
 * count as processed.
 */
export function createFanOutDispatcher(
  registry: ConsumerRegistry,
  sendBatch: (messages: readonly EventMessage[]) => Promise<void>,
  batchSize: number = MAX_MESSAGES_PER_BATCH,
  awaiting: ReadonlySet<string> = new Set(),
): EventDispatcher {
  return async (events) => {
    const messages: EventMessage[] = [];
    const unrouted = new Map<string, Error>();
    for (const event of events) {
      const subscribers = subscribersOf(registry, event.type);
      if (subscribers.length === 0) {
        if (awaiting.has(event.type)) continue;
        unrouted.set(
          event.id,
          new Error(`No consumer subscribes to ${event.type}`),
        );
        continue;
      }
      for (const consumer of subscribers) {
        messages.push({ consumer, event });
      }
    }

    const failed = new Map<string, unknown>(unrouted);
    for (let i = 0; i < messages.length; i += batchSize) {
      const chunk = messages.slice(i, i + batchSize);
      try {
        await sendBatch(chunk);
      } catch (error) {
        for (const message of chunk) {
          failed.set(message.event.id, error);
        }
      }
    }

    return events.map((event): EventDispatchOutcome => {
      const error = failed.get(event.id);
      return error === undefined
        ? { kind: "success", id: event.id }
        : { kind: "failure", id: event.id, error };
    });
  };
}

/**
 * Rebuilds the typed event a queue message carried. The queue serializes
 * its body as JSON, so dates in the payload and `occurredAt` arrive as
 * strings: the message is decoded again through the stored-event decoders,
 * exactly as the relay decoded the outbox row. Throws on an event no
 * decoder accepts, which the queue retries and finally dead-letters.
 */
export function rebuildQueuedEvent(
  event: DomainEvent,
  decoders: EventDecoderRegistry = eventDecoders,
): DomainEvent {
  const wire = JSON.parse(JSON.stringify(event)) as Readonly<{
    id: string;
    type: string;
    aggregateId: string;
    occurredAt: string;
    payload: unknown;
  }>;
  return decodeStoredEvent(
    {
      id: wire.id,
      type: wire.type,
      aggregateId: wire.aggregateId,
      occurredAt: new Date(wire.occurredAt),
      payload: wire.payload,
    },
    decoders,
  );
}

export type ConsumeOutcome = "consumed" | "skipped";

/**
 * Runs the addressed consumer for one message: skip when the consumer's
 * receipt already exists, otherwise handle, then record the receipt.
 * The receipt is written only after the handler succeeded, so a failure
 * leaves nothing behind and the redelivered message runs the consumer
 * again. Throws when the consumer is unknown or fails — the queue
 * handler turns that into a retry.
 */
export async function consumeEventMessage(
  deps: Readonly<{
    container: RequestContainer;
    receipts: ConsumerReceipts;
    registry: ConsumerRegistry;
  }>,
  message: EventMessage,
): Promise<ConsumeOutcome> {
  const consumer = deps.registry[message.consumer];
  if (consumer === undefined) {
    throw new Error(`Unknown consumer: ${message.consumer}`);
  }
  if (!(consumer.events as readonly string[]).includes(message.event.type)) {
    throw new Error(
      `Consumer ${message.consumer} does not subscribe to ${message.event.type}`,
    );
  }
  const { id } = message.event;
  if (await deps.receipts.isConsumed(message.consumer, id)) {
    return "skipped";
  }
  await consumer.handle(deps.container, message.event as never);
  await deps.receipts.markConsumed(message.consumer, id);
  return "consumed";
}
