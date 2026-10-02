import { env, runInDurableObject } from "cloudflare:test";
import type { DiscoveryHarness } from "@repo/core/adapters/durableObject/__conformance__/discoveryFixtures";
import { DoDetailQueries } from "@repo/core/adapters/durableObject/detailQueries";
import { DoExplorationQueries } from "@repo/core/adapters/durableObject/explorationQueries";
import { DoFeedCandidateQueries } from "@repo/core/adapters/durableObject/feedCandidateQueries";
import { DoKeywordSearchQueries } from "@repo/core/adapters/durableObject/keywordSearchQueries";
import type { LuntStateClient } from "@repo/core/adapters/durableObject/protocol/client";
import { DoReferenceQueries } from "@repo/core/adapters/durableObject/referenceQueries";
import { DoUnitOfWorkProvider } from "@repo/core/adapters/durableObject/unitOfWork";
import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";

/** Discovery's read ports over a fresh, real `LuntStateObject`. */
export async function createDiscoveryDoHarness(): Promise<DiscoveryHarness> {
  const stub = env.LUNT_STATE.get(
    env.LUNT_STATE.idFromName(`conformance-${crypto.randomUUID()}`),
  );
  const client = stub as unknown as LuntStateClient;
  return {
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
    detailQueries: new DoDetailQueries(client, UuidV7Generator),
    referenceQueries: new DoReferenceQueries(client, UuidV7Generator),
    explorationQueries: new DoExplorationQueries(client, UuidV7Generator),
    keywordSearchQueries: new DoKeywordSearchQueries(client, UuidV7Generator),
    feedCandidateQueries: new DoFeedCandidateQueries(client, UuidV7Generator),
  };
}
