import type { Message, MessageBatch } from "@cloudflare/workers-types";
import type { DeadLetterInput } from "@repo/core/adapters/do/protocol/deadLetters";
import type { RequestContainer } from "@repo/core/application/di/types";
import type { ConsumerRegistry } from "@repo/core/application/events/consumers";
import type { ConsumerReceipts } from "@repo/core/application/ports/consumerReceipts";
import {
  consumeEventMessage,
  type EventMessage,
  rebuildQueuedEvent,
} from "@repo/core/application/workers/eventDelivery";

export const EVENTS_QUEUE = "lunt-events";
export const DEAD_LETTER_QUEUE = "lunt-events-dlq";

export type QueueDeps = Readonly<{
  container: RequestContainer;
  receipts: ConsumerReceipts;
  registry: ConsumerRegistry;
  /**
   * Turns a message's JSON-carried event back into the typed event
   * (`rebuildQueuedEvent` unless a test supplies its own).
   */
  rebuild?: (event: EventMessage["event"]) => EventMessage["event"];
  /** Keeps a message that exhausted its retries for an operator to re-drive. */
  recordDeadLetter(input: DeadLetterInput): Promise<void>;
  /** Runs `fn` with `container` installed as the request-scoped container. */
  inScope<T>(fn: () => Promise<T>): Promise<T>;
}>;

async function consumeOne(
  deps: QueueDeps,
  message: Message<EventMessage>,
): Promise<void> {
  const { consumer, event } = message.body;
  try {
    const outcome = await deps.inScope(() =>
      consumeEventMessage(deps, {
        consumer,
        event: (deps.rebuild ?? rebuildQueuedEvent)(event),
      }),
    );
    deps.container.logger.info(
      `[queue] ${outcome} ${event.type} ${event.id} → ${consumer}`,
      { eventId: event.id, consumer },
    );
    message.ack();
  } catch (error) {
    deps.container.logger.error(
      `[queue] ${consumer} failed on ${event.type} ${event.id}`,
      { eventId: event.id, consumer, cause: error },
    );
    message.retry();
  }
}

async function keepDeadLetter(
  deps: QueueDeps,
  message: Message<EventMessage>,
): Promise<void> {
  const { consumer, event } = message.body;
  try {
    await deps.recordDeadLetter({
      consumer,
      eventId: event.id,
      eventType: event.type,
      aggregateId: event.aggregateId,
      occurredAt: new Date(event.occurredAt),
      payload: event.payload,
      attempts: message.attempts,
    });
    deps.container.logger.error(
      `[dlq] kept ${event.type} ${event.id} for ${consumer} after its retries ran out`,
      { eventId: event.id, consumer, attempts: message.attempts },
    );
    message.ack();
  } catch (error) {
    deps.container.logger.error(
      `[dlq] could not keep ${event.type} ${event.id} for ${consumer}`,
      { eventId: event.id, consumer, cause: error },
    );
    message.retry();
  }
}

/**
 * Queue handler of the Lunt Worker. Messages of the events queue each
 * address one consumer and are acked or retried on their own, so one
 * failing consumer never re-runs the others. A message that exhausted its
 * retries arrives on the dead-letter queue and is kept in the state
 * object — acked only once it is stored — until an operator re-drives it
 * (`spec/domains/index.md` 「トランザクションとドメインイベント」; consumers
 * are idempotent, so a re-drive continues where it stopped).
 */
export async function handleQueueBatch(
  batch: MessageBatch<EventMessage>,
  deps: QueueDeps,
): Promise<void> {
  const handle =
    batch.queue === DEAD_LETTER_QUEUE ? keepDeadLetter : consumeOne;
  for (const message of batch.messages) {
    await handle(deps, message);
  }
}
