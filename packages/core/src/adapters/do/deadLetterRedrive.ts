import type { EventDecoderRegistry } from "@repo/core/application/events/registry";
import {
  type EventMessage,
  MAX_MESSAGES_PER_BATCH,
} from "@repo/core/application/workers/eventDelivery";
import { decodeStoredEvent } from "@repo/core/application/workers/eventRelayWorker";
import type {
  DeadLetterKey,
  DeadLetterRecord,
  RedriveResult,
} from "./protocol/deadLetters";
import type { SqlExec } from "./sql";
import {
  findPendingDeadLetters,
  listPendingDeadLetters,
  markDeadLettersRedriven,
} from "./store/deadLetters";

export type RedriveDeps = Readonly<{
  sql: SqlExec;
  decoders: EventDecoderRegistry;
  sendBatch: (messages: readonly EventMessage[]) => Promise<void>;
  now: () => Date;
}>;

export type RedriveTarget =
  | Readonly<{ keys: readonly DeadLetterKey[] }>
  | Readonly<{ limit: number }>;

const keyOf = (letter: DeadLetterRecord): DeadLetterKey => ({
  consumer: letter.consumer,
  eventId: letter.eventId,
});

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Sends dead letters back to their consumers through the events queue and
 * marks the ones the queue accepted. The event is decoded again from its
 * stored form, as the relay does, so the consumer receives the same typed
 * event it would have originally. A letter that cannot be decoded or sent
 * stays pending and is reported in `failed`.
 */
export async function redriveDeadLetters(
  deps: RedriveDeps,
  target: RedriveTarget,
): Promise<RedriveResult> {
  const letters =
    "keys" in target
      ? findPendingDeadLetters(deps.sql, target.keys)
      : listPendingDeadLetters(deps.sql, target.limit);
  const failed: (DeadLetterKey & { error: string })[] = [];
  const ready: { key: DeadLetterKey; message: EventMessage }[] = [];
  for (const letter of letters) {
    try {
      const event = decodeStoredEvent(
        {
          id: letter.eventId,
          type: letter.eventType,
          payload: letter.payload,
          occurredAt: letter.occurredAt,
          aggregateId: letter.aggregateId,
        },
        deps.decoders,
      );
      ready.push({
        key: keyOf(letter),
        message: { consumer: letter.consumer, event },
      });
    } catch (error) {
      failed.push({ ...keyOf(letter), error: describe(error) });
    }
  }
  const redriven: DeadLetterKey[] = [];
  for (let i = 0; i < ready.length; i += MAX_MESSAGES_PER_BATCH) {
    const chunk = ready.slice(i, i + MAX_MESSAGES_PER_BATCH);
    try {
      await deps.sendBatch(chunk.map((item) => item.message));
      const keys = chunk.map((item) => item.key);
      markDeadLettersRedriven(deps.sql, keys, deps.now());
      redriven.push(...keys);
    } catch (error) {
      failed.push(
        ...chunk.map((item) => ({ ...item.key, error: describe(error) })),
      );
    }
  }
  return { redriven, failed };
}
