import type { RequestContainer } from "@repo/core/application/di/types";
import {
  awaitingLaterStage,
  type ConsumerRegistry,
  consumers,
  type EventConsumer,
  subscribersOf,
} from "@repo/core/application/events/consumers";
import type { ConsumerReceipts } from "@repo/core/application/ports/consumerReceipts";
import { type DomainEvent, EventId } from "@repo/core/domain/common/event";
import { describe, expect, it, vi } from "vitest";
import {
  consumeEventMessage,
  createFanOutDispatcher,
  type EventMessage,
  MAX_MESSAGES_PER_BATCH,
} from "../eventDelivery";

function event(n: number, type = "probe.pinged"): DomainEvent {
  return {
    id: EventId.create(`event-${n}`),
    type,
    payload: { n },
    occurredAt: new Date("2026-09-28T00:00:00.000Z"),
    aggregateId: `aggregate-${n}`,
  };
}

function consumer(
  events: readonly string[],
  handle: EventConsumer["handle"] = async () => {},
): EventConsumer {
  return { events, handle } as unknown as EventConsumer;
}

class MemoryReceipts implements ConsumerReceipts {
  readonly marked = new Set<string>();
  readonly calls: string[] = [];

  async isConsumed(name: string, eventId: string): Promise<boolean> {
    this.calls.push(`is:${name}`);
    return this.marked.has(`${name}/${eventId}`);
  }

  async markConsumed(name: string, eventId: string): Promise<void> {
    this.calls.push(`mark:${name}`);
    this.marked.add(`${name}/${eventId}`);
  }
}

const container = {} as RequestContainer;

describe("createFanOutDispatcher", () => {
  it("sends one message per subscribed consumer and reports every event delivered", async () => {
    const registry: ConsumerRegistry = {
      first: consumer(["probe.pinged"]),
      second: consumer(["probe.pinged", "other.happened"]),
      unrelated: consumer(["other.happened"]),
    };
    const sent: EventMessage[][] = [];
    const dispatch = createFanOutDispatcher(registry, async (messages) => {
      sent.push([...messages]);
    });

    const outcomes = await dispatch([event(1), event(2, "other.happened")]);

    expect(sent.flat().map((m) => `${m.consumer}:${m.event.id}`)).toEqual([
      "first:event-1",
      "second:event-1",
      "second:event-2",
      "unrelated:event-2",
    ]);
    expect(outcomes).toEqual([
      { kind: "success", id: "event-1" },
      { kind: "success", id: "event-2" },
    ]);
  });

  it("splits the messages into batches of the queue's limit", async () => {
    const registry: ConsumerRegistry = {
      a: consumer(["probe.pinged"]),
      b: consumer(["probe.pinged"]),
    };
    const sizes: number[] = [];
    const dispatch = createFanOutDispatcher(
      registry,
      async (messages) => {
        sizes.push(messages.length);
      },
      3,
    );

    await dispatch([event(1), event(2), event(3), event(4)]);

    expect(sizes).toEqual([3, 3, 2]);
  });

  it("fails only the events whose batch was rejected", async () => {
    const registry: ConsumerRegistry = { a: consumer(["probe.pinged"]) };
    const refused = new Error("queue unavailable");
    let call = 0;
    const dispatch = createFanOutDispatcher(
      registry,
      async () => {
        call += 1;
        if (call === 2) throw refused;
      },
      1,
    );

    const outcomes = await dispatch([event(1), event(2)]);

    expect(outcomes).toEqual([
      { kind: "success", id: "event-1" },
      { kind: "failure", id: "event-2", error: refused },
    ]);
  });

  it("fails an event no consumer subscribes to instead of dropping it", async () => {
    const dispatch = createFanOutDispatcher({}, async () => {});

    const [outcome] = await dispatch([event(1)]);

    expect(outcome?.kind).toBe("failure");
  });

  it("marks processed, without a message, an event only a later stage's consumer subscribes to", async () => {
    const sent: EventMessage[][] = [];
    const dispatch = createFanOutDispatcher(
      {},
      async (messages) => {
        sent.push([...messages]);
      },
      MAX_MESSAGES_PER_BATCH,
      new Set(["probe.pinged"]),
    );

    const outcomes = await dispatch([event(1)]);

    expect(outcomes).toEqual([{ kind: "success", id: "event-1" }]);
    expect(sent).toEqual([]);
  });

  it("delivers authority.stewardship_vacated, whose consumer landed in stage 2, instead of listing it as awaiting a later stage", () => {
    expect(awaitingLaterStage.has("authority.stewardship_vacated")).toBe(false);
    expect(subscribersOf(consumers, "authority.stewardship_vacated")).toEqual([
      "reassessApplicationPremises",
    ]);
  });
});

describe("consumeEventMessage", () => {
  it("runs the consumer and records its receipt after it succeeded", async () => {
    const receipts = new MemoryReceipts();
    const handle = vi.fn(async () => {
      receipts.calls.push("handle");
    });
    const registry: ConsumerRegistry = {
      probe: consumer(["probe.pinged"], handle),
    };

    const outcome = await consumeEventMessage(
      { container, receipts, registry },
      { consumer: "probe", event: event(1) },
    );

    expect(outcome).toBe("consumed");
    expect(handle).toHaveBeenCalledWith(container, event(1));
    expect(receipts.calls).toEqual(["is:probe", "handle", "mark:probe"]);
  });

  it("skips an event the consumer already handled", async () => {
    const receipts = new MemoryReceipts();
    await receipts.markConsumed("probe", "event-1");
    const handle = vi.fn(async () => {});

    const outcome = await consumeEventMessage(
      {
        container,
        receipts,
        registry: { probe: consumer(["probe.pinged"], handle) },
      },
      { consumer: "probe", event: event(1) },
    );

    expect(outcome).toBe("skipped");
    expect(handle).not.toHaveBeenCalled();
  });

  it("leaves no receipt when the consumer fails, so the redelivery runs it again", async () => {
    const receipts = new MemoryReceipts();
    let attempts = 0;
    const registry: ConsumerRegistry = {
      probe: consumer(["probe.pinged"], async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("transient");
      }),
    };
    const message = { consumer: "probe", event: event(1) };

    await expect(
      consumeEventMessage({ container, receipts, registry }, message),
    ).rejects.toThrow("transient");
    expect(receipts.marked.size).toBe(0);

    await expect(
      consumeEventMessage({ container, receipts, registry }, message),
    ).resolves.toBe("consumed");
    expect(attempts).toBe(2);
  });

  it("keeps receipts per consumer", async () => {
    const receipts = new MemoryReceipts();
    const registry: ConsumerRegistry = {
      first: consumer(["probe.pinged"]),
      second: consumer(["probe.pinged"]),
    };
    await consumeEventMessage(
      { container, receipts, registry },
      { consumer: "first", event: event(1) },
    );

    await expect(
      consumeEventMessage(
        { container, receipts, registry },
        { consumer: "second", event: event(1) },
      ),
    ).resolves.toBe("consumed");
  });

  it("rejects a message for an unknown consumer or an event it does not subscribe to", async () => {
    const receipts = new MemoryReceipts();
    const registry: ConsumerRegistry = { probe: consumer(["probe.pinged"]) };

    await expect(
      consumeEventMessage(
        { container, receipts, registry },
        { consumer: "missing", event: event(1) },
      ),
    ).rejects.toThrow("Unknown consumer");
    await expect(
      consumeEventMessage(
        { container, receipts, registry },
        { consumer: "probe", event: event(1, "other.happened") },
      ),
    ).rejects.toThrow("does not subscribe");
  });
});
