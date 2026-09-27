import { env, runInDurableObject } from "cloudflare:test";
import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import { MIGRATIONS } from "@repo/core/adapters/do/store/schema";
import { DoUnitOfWorkProvider } from "@repo/core/adapters/do/unitOfWork";
import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";
import type { EventDraft } from "@repo/core/domain/common/event";
import { describe, expect, it, vi } from "vitest";
import { PROBE_EVENT_TYPE } from "./testWorker";

// The real Lunt state Durable Object in Miniflare. Alarms fire for real
// and almost immediately, so relay outcomes are observed by polling.
// Storage is not reset between tests; each test takes its own object.

function freshName(): string {
  return `test-${crypto.randomUUID()}`;
}

function asClient(stub: unknown): LuntStateClient {
  return stub as LuntStateClient;
}

function probeDraft(objectName: string): EventDraft {
  return {
    type: PROBE_EVENT_TYPE,
    payload: { note: "hello" },
    occurredAt: new Date("2026-09-28T00:00:00.000Z"),
    aggregateId: objectName,
  };
}

type Row = Record<string, unknown>;

describe("LuntStateObject", () => {
  it("applies every schema migration once and records it", async () => {
    const stub = env.LUNT_STATE.get(env.LUNT_STATE.idFromName(freshName()));
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql
        .exec("SELECT version FROM _schema_migrations ORDER BY version")
        .toArray(),
    );
    expect(rows.map((row: Row) => row.version)).toEqual(
      MIGRATIONS.map((migration) => migration.version),
    );
  });

  it("records consumer receipts per consumer", async () => {
    const client = asClient(
      env.LUNT_STATE.get(env.LUNT_STATE.idFromName(freshName())),
    );
    const eventId = UuidV7Generator.next();
    expect(await client.isConsumed("a", eventId)).toBe(false);
    await client.markConsumed("a", eventId);
    await client.markConsumed("a", eventId);
    expect(await client.isConsumed("a", eventId)).toBe(true);
    expect(await client.isConsumed("b", eventId)).toBe(false);
  });

  it("stores the events of a committed unit of work in the outbox", async () => {
    const name = freshName();
    const stub = env.LUNT_STATE.get(env.LUNT_STATE.idFromName(name));
    const provider = new DoUnitOfWorkProvider(asClient(stub), UuidV7Generator);

    await provider.run(async ({ collectEvents }) => {
      collectEvents([probeDraft(name)]);
    });

    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql
        .exec("SELECT event_type, aggregate_id, payload FROM outbox_events")
        .toArray(),
    );
    expect(rows).toEqual([
      {
        event_type: PROBE_EVENT_TYPE,
        aggregate_id: name,
        payload: JSON.stringify({ note: "hello" }),
      },
    ]);
  });

  it("relays an event to each subscribed consumer independently and records a receipt only for the one that succeeded", async () => {
    const name = freshName();
    const stub = env.RELAY_PROBE_STATE.get(
      env.RELAY_PROBE_STATE.idFromName(name),
    );
    const client = asClient(stub);
    const provider = new DoUnitOfWorkProvider(client, UuidV7Generator);

    await provider.run(async ({ collectEvents }) => {
      collectEvents([probeDraft(name)]);
    });

    await vi.waitFor(
      async () => {
        const [outbox, receipts] = await runInDurableObject(
          stub,
          (_instance, state) => [
            state.storage.sql
              .exec("SELECT id, processed_at, attempts FROM outbox_events")
              .toArray(),
            state.storage.sql
              .exec("SELECT consumer, event_id FROM consumer_receipts")
              .toArray(),
          ],
        );
        expect(outbox).toHaveLength(1);
        expect(outbox[0]?.processed_at).not.toBeNull();
        expect(outbox[0]?.attempts).toBe(0);
        expect(receipts).toEqual([
          { consumer: "probeSucceeds", event_id: outbox[0]?.id },
        ]);
      },
      { timeout: 5_000, interval: 50 },
    );
  });

  it("keeps an event it cannot decode for a later attempt instead of dropping it", async () => {
    const name = freshName();
    const stub = env.LUNT_STATE.get(env.LUNT_STATE.idFromName(name));
    const provider = new DoUnitOfWorkProvider(asClient(stub), UuidV7Generator);

    await provider.run(async ({ collectEvents }) => {
      collectEvents([probeDraft(name)]);
    });

    await vi.waitFor(
      async () => {
        const outbox = await runInDurableObject(stub, (_instance, state) =>
          state.storage.sql
            .exec(
              "SELECT processed_at, attempts, next_attempt_at, last_error FROM outbox_events",
            )
            .toArray(),
        );
        expect(outbox).toHaveLength(1);
        expect(outbox[0]?.processed_at).toBeNull();
        expect(outbox[0]?.attempts).toBe(1);
        expect(outbox[0]?.next_attempt_at).not.toBeNull();
        expect(String(outbox[0]?.last_error)).toContain(PROBE_EVENT_TYPE);
      },
      { timeout: 5_000, interval: 50 },
    );
  });
});
