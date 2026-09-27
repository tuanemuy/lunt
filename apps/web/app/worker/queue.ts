import type { Message, MessageBatch } from "@cloudflare/workers-types";
import type { RequestContainer } from "@repo/core/application/di/types";
import type { ConsumerRegistry } from "@repo/core/application/events/consumers";
import type { ConsumerReceipts } from "@repo/core/application/ports/consumerReceipts";
import {
  consumeEventMessage,
  type EventMessage,
} from "@repo/core/application/workers/eventDelivery";

export const EVENTS_QUEUE = "lunt-events";
export const DEAD_LETTER_QUEUE = "lunt-events-dlq";

export type QueueDeps = Readonly<{
  container: RequestContainer;
  receipts: ConsumerReceipts;
  registry: ConsumerRegistry;
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
      consumeEventMessage(deps, message.body),
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

/**
 * Queue handler of the Lunt Worker. Messages of the events queue each
 * address one consumer and are acked or retried on their own, so one
 * failing consumer never re-runs the others. The dead-letter queue always
 * acks: it has no further target, and re-driving is a manual operator
 * action (consumers are idempotent, so a re-drive continues where it
 * stopped).
 */
export async function handleQueueBatch(
  batch: MessageBatch<EventMessage>,
  deps: QueueDeps,
): Promise<void> {
  if (batch.queue === DEAD_LETTER_QUEUE) {
    for (const message of batch.messages) {
      const { consumer, event } = message.body;
      deps.container.logger.error(
        `[dlq] ${event.type} ${event.id} for ${consumer} exhausted its retries`,
        { eventId: event.id, consumer, attempts: message.attempts, event },
      );
      message.ack();
    }
    return;
  }
  for (const message of batch.messages) {
    await consumeOne(deps, message);
  }
}
