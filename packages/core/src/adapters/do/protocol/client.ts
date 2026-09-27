import type { WriteCommand, WriteFailure } from "./commands";
import type { QueryArgs, QueryName, QueryResult } from "./queries";

/** Identity-attached domain event bound for the DO-local outbox. */
export type OutboxEventInput = Readonly<{
  id: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  aggregateId: string;
}>;

export type CommitRequest = Readonly<{
  writes: readonly WriteCommand[];
  events: readonly OutboxEventInput[];
}>;

/**
 * `rejected` names the first command that failed; the whole transaction
 * (every write and every outbox row) has been rolled back.
 */
export type CommitResult =
  | Readonly<{ kind: "committed" }>
  | Readonly<{ kind: "rejected"; index: number; failure: WriteFailure }>;

/**
 * The Lunt state Durable Object's RPC surface as the request Worker,
 * the queue consumer and the scheduled jobs see it. The DO class
 * implements these methods; callers hold the stub behind this
 * structural interface so nothing outside the entry wiring depends on
 * platform stub types. Tests implement it in-process over `node:sqlite`.
 */
export interface LuntStateClient {
  query<K extends QueryName>(
    name: K,
    args: QueryArgs<K>,
  ): Promise<QueryResult<K>>;
  commit(request: CommitRequest): Promise<CommitResult>;
  isConsumed(consumer: string, eventId: string): Promise<boolean>;
  markConsumed(consumer: string, eventId: string): Promise<void>;
  /** Re-arm the outbox alarm — operator escape hatch after manual row edits. */
  kickRelay(): Promise<void>;
}
