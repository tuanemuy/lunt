import { env, runInDurableObject } from "cloudflare:test";
import type { ConformanceHarness } from "@repo/core/adapters/do/__conformance__/harness";
import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import { DoUnitOfWorkProvider } from "@repo/core/adapters/do/unitOfWork";
import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";

/**
 * `createDoHarness` plus the state client, which the Application suites
 * also need for the review desk (a container port outside any unit of
 * work). A fresh, real `LuntStateObject` per call.
 */
export async function createApplicationDoHarness(): Promise<
  readonly [ConformanceHarness, LuntStateClient]
> {
  const stub = env.LUNT_STATE.get(
    env.LUNT_STATE.idFromName(`conformance-${crypto.randomUUID()}`),
  );
  const client = stub as unknown as LuntStateClient;
  const harness: ConformanceHarness = {
    uow: new DoUnitOfWorkProvider(client, UuidV7Generator),
    savedEvents: () =>
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
      ),
  };
  return [harness, client];
}
