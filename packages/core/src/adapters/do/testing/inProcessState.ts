import type { Clock } from "@repo/core/application/ports/clock";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { DoSqliteOutboxRepository } from "../outboxStore";
import type { LuntStateClient } from "../protocol/client";
import { applyMigrations } from "../store/schema";
import { createStateStore, type StateStore } from "../store/stateStore";
import { createNodeSqlStorage, type NodeSqlStorage } from "./nodeSqlStorage";

export type InProcessState = Readonly<{
  storage: NodeSqlStorage;
  store: StateStore;
  /** The same RPC surface the Durable Object exposes, served in-process. */
  client: LuntStateClient;
  outboxRepository: DoSqliteOutboxRepository;
  /** How many times commits asked for the relay alarm. */
  relayRequests(): number;
}>;

/**
 * A fresh, migrated Lunt state store on an in-memory `node:sqlite`
 * database, with an in-process `LuntStateClient` over it. Every argument
 * and result is passed through `structuredClone`, as Workers RPC does, so
 * a value that would not survive the wire fails here too.
 */
export function createInProcessState(
  deps: Readonly<{ clock: Clock; idGenerator: IdGenerator }>,
): InProcessState {
  const storage = createNodeSqlStorage();
  applyMigrations(storage.sql, storage.transaction, deps.clock.now());
  const store = createStateStore(storage.sql, storage.transaction);
  let relayRequests = 0;

  const wire = <T>(value: T): T => structuredClone(value);
  const call = async <T>(fn: () => T): Promise<T> => {
    // Yield first: an RPC never completes synchronously, and callers
    // racing two scopes must be able to interleave between calls.
    await Promise.resolve();
    return wire(fn());
  };

  const client: LuntStateClient = {
    query: (name, args) => call(() => store.query(name, wire(args))),
    commit: (request) =>
      call(() => {
        const result = store.commit(wire(request), deps.clock.now());
        if (result.kind === "committed" && request.events.length > 0) {
          relayRequests += 1;
        }
        return result;
      }),
    isConsumed: (consumer, eventId) =>
      call(() => store.isConsumed(consumer, eventId)),
    markConsumed: (consumer, eventId) =>
      call(() => store.markConsumed(consumer, eventId, deps.clock.now())),
    kickRelay: () =>
      call(() => {
        relayRequests += 1;
      }),
  };

  return {
    storage,
    store,
    client,
    outboxRepository: new DoSqliteOutboxRepository(
      storage.sql,
      deps.idGenerator,
      deps.clock,
    ),
    relayRequests: () => relayRequests,
  };
}
