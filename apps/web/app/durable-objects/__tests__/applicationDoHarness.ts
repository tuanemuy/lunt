import { env, runInDurableObject } from "cloudflare:test";
import type { SavedEvent } from "@repo/core/adapters/durableObject/__conformance__/harness";
import type { LuntStateClient } from "@repo/core/adapters/durableObject/protocol/client";
import {
  type IdGenerator,
  UuidV7Generator,
} from "@repo/core/application/ports/idGenerator";

/**
 * What `applicationHarness` binds to the test-only kinds, over a fresh,
 * real `LuntStateObject`: its client, the id generator, and the outbox
 * rows as the relay would see them (every stored row, processed or not —
 * the relay alarm fires on its own here).
 */
export async function createApplicationDoHarness(): Promise<
  readonly [LuntStateClient, IdGenerator, () => Promise<readonly SavedEvent[]>]
> {
  const stub = env.LUNT_STATE.get(
    env.LUNT_STATE.idFromName(`conformance-${crypto.randomUUID()}`),
  );
  const savedEvents = () =>
    runInDurableObject(stub, (_instance, state) =>
      state.storage.sql
        .exec<{ event_type: string; aggregate_id: string; payload: string }>(
          "SELECT event_type, aggregate_id, payload FROM outbox_events ORDER BY created_at, id",
        )
        .toArray()
        .map((row) => ({
          type: row.event_type,
          aggregateId: row.aggregate_id,
          payload: JSON.parse(row.payload) as unknown,
        })),
    );
  return [stub as unknown as LuntStateClient, UuidV7Generator, savedEvents];
}
