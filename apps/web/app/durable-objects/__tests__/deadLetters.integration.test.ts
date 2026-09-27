import { env, runInDurableObject } from "cloudflare:test";
import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import { DoUnitOfWorkProvider } from "@repo/core/adapters/do/unitOfWork";
import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBE_EVENT_TYPE, probeHealth } from "./testWorker";

// The whole dead-letter path on the real runtime: a consumer that keeps
// failing exhausts the events queue's retries (max_retries 2 here), the
// message moves to the dead-letter queue, the dead-letter consumer keeps
// it in the state object, and an operator's re-drive sends it back to the
// consumer — which, once its cause is fixed, completes and records its
// receipt (`spec/domains/index.md` 「トランザクションとドメインイベント」).

afterEach(() => {
  probeHealth.failing = true;
});

type Row = Record<string, unknown>;

describe("dead letters", () => {
  it("keeps a message that exhausted its retries and re-drives it to its consumer", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const stub = env.RELAY_PROBE_STATE.get(
      env.RELAY_PROBE_STATE.idFromName(name),
    );
    const client = stub as unknown as LuntStateClient;
    const provider = new DoUnitOfWorkProvider(client, UuidV7Generator);

    await provider.run(async ({ collectEvents }) => {
      collectEvents([
        {
          type: PROBE_EVENT_TYPE,
          payload: { note: "hello" },
          occurredAt: new Date("2026-09-28T00:00:00.000Z"),
          aggregateId: name,
        },
      ]);
    });

    const letters = await vi.waitFor(
      async () => {
        const pending = await client.listDeadLetters(10);
        expect(pending).toHaveLength(1);
        return pending;
      },
      { timeout: 10_000, interval: 100 },
    );
    expect(letters[0]).toMatchObject({
      consumer: "probeFails",
      eventType: PROBE_EVENT_TYPE,
      aggregateId: name,
      payload: { note: "hello" },
      deadLetteredCount: 1,
      redrivenAt: null,
    });
    const eventId = letters[0]?.eventId ?? "";

    // The consumer that succeeded is not affected by the other's failure.
    const receiptsBefore = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql
        .exec("SELECT consumer FROM consumer_receipts ORDER BY consumer")
        .toArray(),
    );
    expect(receiptsBefore.map((row: Row) => row.consumer)).toEqual([
      "probeSucceeds",
    ]);

    probeHealth.failing = false;
    const result = await client.redriveDeadLetters({ limit: 10 });
    expect(result).toEqual({
      redriven: [{ consumer: "probeFails", eventId }],
      failed: [],
    });

    await vi.waitFor(
      async () => {
        const receipts = await runInDurableObject(stub, (_instance, state) =>
          state.storage.sql
            .exec("SELECT consumer FROM consumer_receipts ORDER BY consumer")
            .toArray(),
        );
        expect(receipts.map((row: Row) => row.consumer)).toEqual([
          "probeFails",
          "probeSucceeds",
        ]);
      },
      { timeout: 10_000, interval: 100 },
    );
    expect(await client.listDeadLetters(10)).toEqual([]);
  });

  it("keeps a message again when its re-drive fails once more", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const client = env.RELAY_PROBE_STATE.get(
      env.RELAY_PROBE_STATE.idFromName(name),
    ) as unknown as LuntStateClient;
    await new DoUnitOfWorkProvider(client, UuidV7Generator).run(
      async ({ collectEvents }) => {
        collectEvents([
          {
            type: PROBE_EVENT_TYPE,
            payload: {},
            occurredAt: new Date("2026-09-28T00:00:00.000Z"),
            aggregateId: name,
          },
        ]);
      },
    );
    await vi.waitFor(
      async () => expect(await client.listDeadLetters(10)).toHaveLength(1),
      { timeout: 10_000, interval: 100 },
    );

    await client.redriveDeadLetters({ limit: 10 });

    await vi.waitFor(
      async () => {
        const [letter] = await client.listDeadLetters(10);
        expect(letter?.deadLetteredCount).toBe(2);
        expect(letter?.redrivenAt).toBeNull();
      },
      { timeout: 10_000, interval: 100 },
    );
  });
});
