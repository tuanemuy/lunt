import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import type { EventDecoderRegistry } from "@repo/core/application/events/registry";
import type { DomainEvent, EventDecoder } from "@repo/core/domain/common/event";
import { describe, expect, it } from "vitest";
import type { DeadLetterInput } from "../protocol/deadLetters";
import { createInProcessState } from "../testing/inProcessState";

const T0 = new Date("2026-09-28T00:00:00.000Z");

const decode: EventDecoder<DomainEvent> = (payload, meta) => ({
  type: "probe.pinged",
  payload: payload as Record<string, unknown>,
  ...meta,
});
const decoders = { "probe.pinged": decode } as unknown as EventDecoderRegistry;

function setup() {
  let now = T0;
  const state = createInProcessState({
    clock: { now: () => now },
    idGenerator: new FakeIdGenerator(),
    decoders,
  });
  return {
    client: state.client,
    redriven: state.redriven,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

function letter(
  consumer: string,
  eventId: string,
  eventType = "probe.pinged",
): DeadLetterInput {
  return {
    consumer,
    eventId,
    eventType,
    aggregateId: `aggregate-${eventId}`,
    occurredAt: T0,
    payload: { n: eventId },
    attempts: 4,
  };
}

describe("dead letters", () => {
  it("are kept per (consumer, event) and listed oldest first", async () => {
    const r = setup();
    await r.client.recordDeadLetter(letter("b", "e1"));
    r.advance(1000);
    await r.client.recordDeadLetter(letter("a", "e1"));

    const listed = await r.client.listDeadLetters(10);

    expect(listed.map((l) => [l.consumer, l.eventId])).toEqual([
      ["b", "e1"],
      ["a", "e1"],
    ]);
    expect(listed[0]).toMatchObject({
      eventType: "probe.pinged",
      payload: { n: "e1" },
      occurredAt: T0,
      attempts: 4,
      deadLetteredCount: 1,
      firstDeadLetteredAt: T0,
      redrivenAt: null,
    });
    expect(await r.client.listDeadLetters(1)).toHaveLength(1);
  });

  it("re-drive sends the decoded event back to its consumer and marks it", async () => {
    const r = setup();
    await r.client.recordDeadLetter(letter("a", "e1"));
    await r.client.recordDeadLetter(letter("a", "e2"));

    const result = await r.client.redriveDeadLetters({
      keys: [{ consumer: "a", eventId: "e2" }],
    });

    expect(result).toEqual({
      redriven: [{ consumer: "a", eventId: "e2" }],
      failed: [],
    });
    expect(r.redriven).toEqual([
      {
        consumer: "a",
        event: {
          id: "e2",
          type: "probe.pinged",
          payload: { n: "e2" },
          occurredAt: T0,
          aggregateId: "aggregate-e2",
        },
      },
    ]);
    expect((await r.client.listDeadLetters(10)).map((l) => l.eventId)).toEqual([
      "e1",
    ]);
  });

  it("a letter that dead-letters again after a re-drive is pending again, counted twice", async () => {
    const r = setup();
    await r.client.recordDeadLetter(letter("a", "e1"));
    await r.client.redriveDeadLetters({ limit: 10 });
    expect(await r.client.listDeadLetters(10)).toEqual([]);

    r.advance(5000);
    await r.client.recordDeadLetter(letter("a", "e1"));

    const [again] = await r.client.listDeadLetters(10);
    expect(again).toMatchObject({
      deadLetteredCount: 2,
      firstDeadLetteredAt: T0,
      lastDeadLetteredAt: new Date(T0.getTime() + 5000),
      redrivenAt: null,
    });
  });

  it("leaves a letter it cannot decode pending and reports it", async () => {
    const r = setup();
    await r.client.recordDeadLetter(letter("a", "e1", "unknown.type"));

    const result = await r.client.redriveDeadLetters({ limit: 10 });

    expect(result.redriven).toEqual([]);
    expect(result.failed).toMatchObject([
      {
        consumer: "a",
        eventId: "e1",
        error: expect.stringContaining("unknown.type"),
      },
    ]);
    expect(await r.client.listDeadLetters(10)).toHaveLength(1);
  });
});
