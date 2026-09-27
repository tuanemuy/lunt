import type { Message, MessageBatch } from "@cloudflare/workers-types";
import type { DeadLetterInput } from "@repo/core/adapters/do/protocol/deadLetters";
import { FakeLogger } from "@repo/core/application/__tests__/fakes/fakeLogger";
import type { RequestContainer } from "@repo/core/application/di/types";
import type {
  ConsumerRegistry,
  EventConsumer,
} from "@repo/core/application/events/consumers";
import type { ConsumerReceipts } from "@repo/core/application/ports/consumerReceipts";
import type { EventMessage } from "@repo/core/application/workers/eventDelivery";
import { EventId } from "@repo/core/domain/common/event";
import { describe, expect, it } from "vitest";
import { DEAD_LETTER_QUEUE, EVENTS_QUEUE, handleQueueBatch } from "../queue";

type Disposition = "ack" | "retry" | "pending";

function message(consumer: string, id: string) {
  const state: { disposition: Disposition } = { disposition: "pending" };
  const body: EventMessage = {
    consumer,
    event: {
      id: EventId.create(id),
      type: "probe.pinged",
      payload: {},
      occurredAt: new Date("2026-09-28T00:00:00.000Z"),
      aggregateId: id,
    },
  };
  const msg = {
    id,
    body,
    attempts: 1,
    timestamp: new Date(),
    ack: () => {
      state.disposition = "ack";
    },
    retry: () => {
      state.disposition = "retry";
    },
  } as unknown as Message<EventMessage>;
  return { msg, state };
}

function batch(
  queue: string,
  messages: readonly Message<EventMessage>[],
): MessageBatch<EventMessage> {
  return {
    queue,
    messages,
    ackAll: () => {},
    retryAll: () => {},
  } as unknown as MessageBatch<EventMessage>;
}

const receipts: ConsumerReceipts = {
  isConsumed: async () => false,
  markConsumed: async () => {},
};

function deps(
  registry: ConsumerRegistry,
  logger = new FakeLogger(),
  recordDeadLetter: (input: DeadLetterInput) => Promise<void> = async () => {},
) {
  return {
    container: { logger } as unknown as RequestContainer,
    receipts,
    registry,
    recordDeadLetter,
    inScope: <T>(fn: () => Promise<T>) => fn(),
  };
}

const ok = { events: ["probe.pinged"], handle: async () => {} };
const failing = {
  events: ["probe.pinged"],
  handle: async () => {
    throw new Error("consumer failed");
  },
};
const registry = { ok, failing } as unknown as Record<string, EventConsumer>;

describe("handleQueueBatch", () => {
  it("acks each message whose consumer succeeded and retries only the failed one", async () => {
    const a = message("ok", "e1");
    const b = message("failing", "e1");
    const c = message("ok", "e2");

    await handleQueueBatch(
      batch(EVENTS_QUEUE, [a.msg, b.msg, c.msg]),
      deps(registry),
    );

    expect([a.state, b.state, c.state].map((s) => s.disposition)).toEqual([
      "ack",
      "retry",
      "ack",
    ]);
  });

  it("keeps every dead letter for re-drive and acks it only once stored", async () => {
    const logger = new FakeLogger();
    const dead = message("failing", "e1");
    const kept: DeadLetterInput[] = [];

    await handleQueueBatch(
      batch(DEAD_LETTER_QUEUE, [dead.msg]),
      deps(registry, logger, async (input) => {
        kept.push(input);
      }),
    );

    expect(kept).toEqual([
      {
        consumer: "failing",
        eventId: "e1",
        eventType: "probe.pinged",
        aggregateId: "e1",
        occurredAt: new Date("2026-09-28T00:00:00.000Z"),
        payload: {},
        attempts: 1,
      },
    ]);
    expect(dead.state.disposition).toBe("ack");
    expect(logger.byLevel("error")).toHaveLength(1);
  });

  it("retries a dead letter it could not store instead of dropping it", async () => {
    const dead = message("failing", "e1");

    await handleQueueBatch(
      batch(DEAD_LETTER_QUEUE, [dead.msg]),
      deps(registry, new FakeLogger(), async () => {
        throw new Error("state object unavailable");
      }),
    );

    expect(dead.state.disposition).toBe("retry");
  });
});
