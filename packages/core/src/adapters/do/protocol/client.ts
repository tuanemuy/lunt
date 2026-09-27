import type { WriteCommand, WriteFailure } from "./commands";
import type {
  DeadLetterInput,
  DeadLetterKey,
  DeadLetterRecord,
  RedriveResult,
} from "./deadLetters";
import type { DevMailInput, DevMailQuery, DevMailRecord } from "./devMailbox";
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
  /** Operator escape hatch: requeue parked outbox rows and relay now. */
  kickRelay(): Promise<void>;
  /** Dead-letter consumer: keep a message that exhausted its retries. */
  recordDeadLetter(input: DeadLetterInput): Promise<void>;
  /** Operator: dead letters not yet re-driven, oldest first. */
  listDeadLetters(limit: number): Promise<readonly DeadLetterRecord[]>;
  /**
   * Operator: send dead letters back to their consumers through the events
   * queue — the given ones, or up to `limit` of the oldest pending ones.
   */
  redriveDeadLetters(
    target:
      | Readonly<{ keys: readonly DeadLetterKey[] }>
      | Readonly<{ limit: number }>,
  ): Promise<RedriveResult>;
  /**
   * Development inbox transport: keep a "sent" mail. Outside any unit of
   * work — sending is a side effect, never part of a commit.
   */
  devMailboxAppend(mail: DevMailInput): Promise<void>;
  /** Development inbox: stored mails, newest first. */
  devMailboxList(query: DevMailQuery): Promise<readonly DevMailRecord[]>;
}
