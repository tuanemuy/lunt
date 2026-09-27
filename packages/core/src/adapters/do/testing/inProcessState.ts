import type { EventDecoderRegistry } from "@repo/core/application/events/registry";
import type { Clock } from "@repo/core/application/ports/clock";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { EventMessage } from "@repo/core/application/workers/eventDelivery";
import { redriveDeadLetters } from "../deadLetterRedrive";
import {
  DoSqliteOutboxRepository,
  requeueParkedOutboxEvents,
} from "../outboxStore";
import type { LuntStateClient } from "../protocol/client";
import { listPendingDeadLetters, recordDeadLetter } from "../store/deadLetters";
import { appendDevMail, listDevMail } from "../store/devMailbox";
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
  /** Messages re-driven dead letters were sent back to the queue as. */
  redriven: readonly EventMessage[];
}>;

/**
 * A fresh, migrated Lunt state store on an in-memory `node:sqlite`
 * database, with an in-process `LuntStateClient` over it. Every argument
 * and result is passed through `structuredClone`, as Workers RPC does, so
 * a value that would not survive the wire fails here too.
 */
export function createInProcessState(
  deps: Readonly<{
    clock: Clock;
    idGenerator: IdGenerator;
    /** Decoders re-driven dead letters are decoded with. */
    decoders?: EventDecoderRegistry;
  }>,
): InProcessState {
  const storage = createNodeSqlStorage();
  applyMigrations(storage.sql, storage.transaction, deps.clock.now());
  const store = createStateStore(storage.sql, storage.transaction);
  let relayRequests = 0;

  const redriven: EventMessage[] = [];
  const wire = <T>(value: T): T => structuredClone(value);
  const call = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    // Yield first: an RPC never completes synchronously, and callers
    // racing two scopes must be able to interleave between calls.
    await Promise.resolve();
    try {
      return wire(await fn());
    } catch (error) {
      // Workers RPC delivers a thrown error as a plain `Error`: its class
      // does not survive the wire, so it must not survive here either.
      throw new Error(error instanceof Error ? error.message : String(error));
    }
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
        requeueParkedOutboxEvents(storage.sql);
        relayRequests += 1;
      }),
    recordDeadLetter: (input) =>
      call(() => recordDeadLetter(storage.sql, wire(input), deps.clock.now())),
    listDeadLetters: (limit) =>
      call(() => listPendingDeadLetters(storage.sql, limit)),
    redriveDeadLetters: (target) =>
      call(() =>
        redriveDeadLetters(
          {
            sql: storage.sql,
            decoders: deps.decoders ?? {},
            sendBatch: async (messages) => {
              redriven.push(...wire(messages));
            },
            now: () => deps.clock.now(),
          },
          wire(target),
        ),
      ),
    devMailboxAppend: (mail) =>
      call(() => appendDevMail(storage.sql, wire(mail))),
    devMailboxList: (query) =>
      call(() => listDevMail(storage.sql, wire(query))),
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
    redriven,
  };
}
