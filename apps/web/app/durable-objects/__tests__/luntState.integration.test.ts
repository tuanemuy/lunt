import { env, runInDurableObject } from "cloudflare:test";
import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import { MIGRATIONS } from "@repo/core/adapters/do/store/schema";
import { DoUnitOfWorkProvider } from "@repo/core/adapters/do/unitOfWork";
import { createRequestContainer } from "@repo/core/application/di/container";
import { ForbiddenError } from "@repo/core/application/errors";
import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";
import {
  drainPages,
  runDailyJobs,
} from "@repo/core/application/workers/dailyJobs";
import { Account } from "@repo/core/domain/account/entity";
import { AuthorityEvents } from "@repo/core/domain/authority/events";
import type { EventDraft } from "@repo/core/domain/common/event";
import { AccountId, PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it, vi } from "vitest";
import { presentationPorts } from "../../presentation/ports";
import { stateClient } from "../../worker/stateClient";
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

  it("keeps the development clock's offset, only moving forward, and refuses it without the development tools", async () => {
    const stub = env.LUNT_STATE.get(env.LUNT_STATE.idFromName(freshName()));
    const client = asClient(stub);
    expect(await client.devClockOffset()).toBe(0);
    expect(await client.devAdvanceClock(60_000)).toEqual({
      kind: "advanced",
      offsetMs: 60_000,
    });
    expect(await client.devAdvanceClock(120_000)).toEqual({
      kind: "advanced",
      offsetMs: 180_000,
    });
    expect((await client.devAdvanceClock(-1)).kind).toBe("refused");

    const refused = await runInDurableObject(stub, async (instance) => {
      const object = instance as unknown as {
        env: { DEV_TOOLS?: string | undefined };
        devAdvanceClock(ms: number): Promise<{ kind: string }>;
      };
      const saved = object.env.DEV_TOOLS;
      object.env.DEV_TOOLS = "0";
      try {
        return (await object.devAdvanceClock(60_000)).kind;
      } finally {
        object.env.DEV_TOOLS = saved;
      }
    });
    expect(refused).toBe("refused");
    expect(await client.devClockOffset()).toBe(180_000);
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

  it("refuses a unit of work whose access condition no longer holds and keeps none of it", async () => {
    const name = freshName();
    const stub = env.LUNT_STATE.get(env.LUNT_STATE.idFromName(name));
    const provider = new DoUnitOfWorkProvider(asClient(stub), UuidV7Generator);
    const nobody = AccountId.create(UuidV7Generator.next());

    const refused = provider.run(async ({ accessGuard, collectEvents }) => {
      accessGuard.holdsRole(nobody, "operator");
      collectEvents([probeDraft(name)]);
    });

    await expect(refused).rejects.toBeInstanceOf(ForbiddenError);
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT id FROM outbox_events").toArray(),
    );
    expect(rows).toEqual([]);
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

  it("marks processed an event only a later stage's consumer subscribes to", async () => {
    const name = freshName();
    const stub = env.LUNT_STATE.get(env.LUNT_STATE.idFromName(name));
    const provider = new DoUnitOfWorkProvider(asClient(stub), UuidV7Generator);
    const place = {
      kind: "place",
      id: PlaceId.create(UuidV7Generator.next()),
    } as const;

    await provider.run(async ({ collectEvents }) => {
      collectEvents([AuthorityEvents.stewardshipVacated(place, new Date())]);
    });

    await vi.waitFor(
      async () => {
        const outbox = await runInDurableObject(stub, (_instance, state) =>
          state.storage.sql
            .exec(
              "SELECT processed_at, attempts, last_error FROM outbox_events",
            )
            .toArray(),
        );
        expect(outbox).toHaveLength(1);
        expect(outbox[0]?.processed_at).not.toBeNull();
        expect(outbox[0]?.last_error).toBeNull();
      },
      { timeout: 5_000, interval: 50 },
    );
  });

  it("runs a daily job over the production container, one unit of work per target", async () => {
    const client = stateClient(
      env.LUNT_STATE as unknown as DurableObjectNamespace,
      freshName(),
    );
    const container = createRequestContainer(env, client, presentationPorts);
    const targets = ["a", "b", "c"].map((n, i) =>
      Account.register({
        id: `ffffffff-ffff-7fff-8fff-00000000000${i + 1}`,
        email: `${n}@example.com`,
      }),
    );
    await container.unitOfWorkProvider.run(async ({ accountRepository }) => {
      for (const account of targets) await accountRepository.insert(account);
    });

    const [result] = await runDailyJobs(container, [
      {
        name: "deleteEveryAccount",
        run: (c) =>
          drainPages<Account>({
            job: "deleteEveryAccount",
            logger: c.logger,
            keyOf: (account) => account.id,
            readPage: (page) =>
              c.unitOfWorkProvider.run(async ({ accountRepository }) =>
                (
                  await accountRepository.findByIds(targets.map((t) => t.id))
                ).slice((page - 1) * 2, page * 2),
              ),
            process: (account) =>
              c.unitOfWorkProvider.run(async ({ accountRepository }) => {
                const found = await accountRepository.findById(account.id);
                if (found !== null) {
                  await accountRepository.delete(
                    account.id,
                    found.expectedVersion,
                  );
                }
              }),
          }),
      },
    ]);

    expect(result?.outcome).toEqual({
      kind: "completed",
      report: { processed: 3, failed: 0, skipped: 0, abandoned: false },
    });
  });

  it("relays a row an earlier version parked once an operator kicks the relay", async () => {
    const name = freshName();
    const stub = env.RELAY_PROBE_STATE.get(
      env.RELAY_PROBE_STATE.idFromName(name),
    );
    const client = asClient(stub);
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.deleteAlarm();
      state.storage.sql.exec(
        `INSERT INTO outbox_events
           (id, event_type, aggregate_id, payload, occurred_at, created_at, attempts, failed_at)
           VALUES (?, ?, ?, '{}', 0, 0, 2, 0)`,
        UuidV7Generator.next(),
        PROBE_EVENT_TYPE,
        name,
      );
    });

    await client.kickRelay();

    await vi.waitFor(
      async () => {
        const outbox = await runInDurableObject(stub, (_instance, state) =>
          state.storage.sql
            .exec("SELECT processed_at, failed_at FROM outbox_events")
            .toArray(),
        );
        expect(outbox[0]?.failed_at).toBeNull();
        expect(outbox[0]?.processed_at).not.toBeNull();
      },
      { timeout: 5_000, interval: 50 },
    );
  });
});
