import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { FakeLogger } from "@repo/core/application/__tests__/fakes/fakeLogger";
import type { WorkerContainer } from "@repo/core/application/di/types";
import type {
  ConsumerRegistry,
  EventConsumer,
} from "@repo/core/application/events/consumers";
import type { EventDecoderRegistry } from "@repo/core/application/events/registry";
import {
  createFanOutDispatcher,
  type EventMessage,
} from "@repo/core/application/workers/eventDelivery";
import type {
  DomainEvent,
  EventDecoder,
  EventDraft,
} from "@repo/core/domain/common/event";
import { describe, expect, it } from "vitest";
import { runOutboxAlarmTick } from "../alarm";
import { nextOutboxWakeUpAt, requeueParkedOutboxEvents } from "../outboxStore";
import { createInProcessState } from "../testing/inProcessState";
import { DoUnitOfWorkProvider } from "../unitOfWork";

const T0 = new Date("2026-09-28T00:00:00.000Z");
const LEASE_MS = 300_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const decode: EventDecoder<DomainEvent> = (payload, meta) => ({
  type: "probe.pinged",
  payload: payload as Record<string, unknown>,
  ...meta,
});
const decoders = { "probe.pinged": decode } as unknown as EventDecoderRegistry;
const registry: ConsumerRegistry = {
  first: { events: ["probe.pinged"], handle: async () => {} },
  second: { events: ["probe.pinged"], handle: async () => {} },
} as unknown as Record<string, EventConsumer>;

function draft(type = "probe.pinged"): EventDraft {
  return {
    type,
    payload: { hello: "world" },
    occurredAt: T0,
    aggregateId: "a",
  };
}

function setup() {
  let now = T0;
  const clock = { now: () => now };
  const idGenerator = new FakeIdGenerator();
  const state = createInProcessState({ clock, idGenerator });
  const logger = new FakeLogger();
  const container: WorkerContainer = {
    clock,
    idGenerator,
    logger,
    outboxRepository: state.outboxRepository,
  };
  const alarms: Date[] = [];
  const sent: EventMessage[] = [];
  let failSends = false;
  const tick = () =>
    runOutboxAlarmTick({
      container,
      dispatch: createFanOutDispatcher(registry, async (messages) => {
        if (failSends) throw new Error("queue unavailable");
        sent.push(...messages);
      }),
      relayTuning: {
        batchSize: 100,
        leaseMs: LEASE_MS,
        alertAfterAttempts: 3,
        decoderRegistry: decoders,
      },
      retentionMs: RETENTION_MS,
      nextWakeUpAt: () => nextOutboxWakeUpAt(state.storage.sql, LEASE_MS),
      setAlarm: async (at) => {
        alarms.push(at);
      },
    });
  const commit = (drafts: readonly EventDraft[]) =>
    new DoUnitOfWorkProvider(state.client, idGenerator).run(
      async ({ collectEvents }) => collectEvents(drafts),
    );
  const rows = () =>
    state.storage.sql
      .exec<{
        processed_at: number | null;
        failed_at: number | null;
        attempts: number;
      }>("SELECT processed_at, failed_at, attempts FROM outbox_events")
      .toArray();
  return {
    state,
    logger,
    tick,
    commit,
    rows,
    sent,
    alarms,
    setNow: (at: Date) => {
      now = at;
    },
    failSends: (value: boolean) => {
      failSends = value;
    },
  };
}

describe("outbox alarm relay", () => {
  it("asks for the alarm when a unit of work stores events", async () => {
    const r = setup();
    await r.commit([]);
    expect(r.state.relayRequests()).toBe(0);
    await r.commit([draft()]);
    expect(r.state.relayRequests()).toBe(1);
  });

  it("delivers each event to every subscribed consumer, marks it processed, and does not re-arm once drained", async () => {
    const r = setup();
    await r.commit([draft(), draft()]);

    const result = await r.tick();

    expect(result.processed).toBe(2);
    expect(r.sent.map((m) => m.consumer)).toEqual([
      "first",
      "second",
      "first",
      "second",
    ]);
    expect(r.sent[0]?.event.payload).toEqual({ hello: "world" });
    expect(r.rows().every((row) => row.processed_at !== null)).toBe(true);
    expect(r.alarms).toEqual([]);
  });

  it("reschedules a batch the queue refused and re-arms for the retry", async () => {
    const r = setup();
    await r.commit([draft()]);
    r.failSends(true);

    await r.tick();

    expect(r.rows()).toMatchObject([
      { processed_at: null, failed_at: null, attempts: 1 },
    ]);
    expect(r.alarms).toHaveLength(1);
    expect(r.alarms[0]?.getTime()).toBeGreaterThan(T0.getTime());

    r.failSends(false);
    r.setNow(new Date(T0.getTime() + 60_000));
    await r.tick();
    expect(r.rows()[0]?.processed_at).not.toBeNull();
  });

  it("never gives up on an event the queue keeps refusing, and delivers it once the queue is back", async () => {
    const r = setup();
    await r.commit([draft()]);
    r.failSends(true);

    let now = T0.getTime();
    for (let attempt = 1; attempt <= 12; attempt++) {
      await r.tick();
      const wake = r.alarms.at(-1)?.getTime() ?? Number.NaN;
      // Backoff grows but stays capped at an hour; the alarm stays armed.
      expect(wake - now).toBeLessThanOrEqual(60 * 60_000);
      now = wake;
      r.setNow(new Date(now));
    }

    expect(r.rows()).toMatchObject([
      { processed_at: null, failed_at: null, attempts: 12 },
    ]);
    // From the alert threshold (3) on, each failure is an error log.
    expect(
      r.logger
        .byLevel("error")
        .filter((entry) => entry.message.includes("still undelivered")),
    ).toHaveLength(10);

    r.failSends(false);
    await r.tick();
    expect(r.rows()[0]?.processed_at).not.toBeNull();
    expect(r.sent.map((m) => m.consumer)).toEqual(["first", "second"]);
  });

  it("keeps an event nothing can decode pending and retrying instead of parking it", async () => {
    const r = setup();
    await r.commit([draft("unknown.type")]);

    await r.tick();
    r.setNow(new Date(T0.getTime() + 60 * 60_000));
    await r.tick();

    expect(r.rows()).toMatchObject([
      { processed_at: null, failed_at: null, attempts: 2 },
    ]);
    expect(r.alarms.length).toBeGreaterThan(0);
    expect(r.sent).toEqual([]);
  });

  it("puts rows an earlier version parked back in line when the relay is kicked", async () => {
    const r = setup();
    await r.commit([draft()]);
    r.state.storage.sql.exec(
      "UPDATE outbox_events SET failed_at = ?, attempts = 2",
      T0.getTime(),
    );

    requeueParkedOutboxEvents(r.state.storage.sql);
    await r.tick();

    expect(r.rows()[0]?.processed_at).not.toBeNull();
  });

  it("prunes processed events after the retention period", async () => {
    const r = setup();
    await r.commit([draft()]);
    await r.tick();

    r.setNow(new Date(T0.getTime() + RETENTION_MS + 1));
    const { deleted } = await r.tick();

    expect(deleted).toBe(1);
    expect(r.rows()).toEqual([]);
  });
});
