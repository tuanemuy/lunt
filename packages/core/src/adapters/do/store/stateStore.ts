import type {
  CommitRequest,
  CommitResult,
  OutboxEventInput,
} from "../protocol/client";
import type { WriteFailure } from "../protocol/commands";
import type { QueryArgs, QueryName, QueryResult } from "../protocol/queries";
import type { SqlExec, SqlRow, TransactionRunner } from "../sql";
import { applyCommand } from "./commands";
import { runQuery } from "./queries";

/**
 * The synchronous core of the Lunt state Durable Object: named reads,
 * the unit-of-work commit, and consumer receipts over one SQLite
 * database. The DO class wraps it for RPC; tests wrap it in-process over
 * `node:sqlite`, so both run exactly the same SQL.
 *
 * Everything here runs to completion without an `await`, which is what
 * makes a Durable Object's single-threaded execution serialize it
 * against every other request.
 */
export type StateStore = Readonly<{
  query<K extends QueryName>(name: K, args: QueryArgs<K>): QueryResult<K>;
  commit(request: CommitRequest, now: Date): CommitResult;
  isConsumed(consumer: string, eventId: string): boolean;
  markConsumed(consumer: string, eventId: string, now: Date): void;
  pruneReceipts(olderThan: Date): { deleted: number };
}>;

// Thrown inside the transaction to abort it; converted back to data
// before leaving `commit`. Never escapes this module.
class Rejection {
  constructor(
    readonly index: number,
    readonly failure: WriteFailure,
  ) {}
}

function insertOutboxEvent(
  sql: SqlExec,
  event: OutboxEventInput,
  now: Date,
): void {
  sql.exec(
    `INSERT INTO outbox_events
       (id, event_type, aggregate_id, payload, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    event.id,
    event.type,
    event.aggregateId,
    JSON.stringify(event.payload),
    event.occurredAt.getTime(),
    now.getTime(),
  );
}

export function createStateStore(
  sql: SqlExec,
  transaction: TransactionRunner,
): StateStore {
  return {
    query: (name, args) => runQuery(sql, name, args),

    commit(request, now) {
      try {
        transaction(() => {
          request.writes.forEach((command, index) => {
            const outcome = applyCommand(sql, command);
            if (outcome.kind !== "applied") {
              throw new Rejection(index, outcome);
            }
          });
          for (const event of request.events) {
            insertOutboxEvent(sql, event, now);
          }
        });
      } catch (error) {
        if (error instanceof Rejection) {
          return {
            kind: "rejected",
            index: error.index,
            failure: error.failure,
          };
        }
        throw error;
      }
      return { kind: "committed" };
    },

    isConsumed(consumer, eventId) {
      return (
        sql
          .exec(
            "SELECT 1 AS ok FROM consumer_receipts WHERE consumer = ? AND event_id = ?",
            consumer,
            eventId,
          )
          .toArray().length > 0
      );
    },

    markConsumed(consumer, eventId, now) {
      sql.exec(
        `INSERT INTO consumer_receipts (consumer, event_id, consumed_at)
           VALUES (?, ?, ?) ON CONFLICT (consumer, event_id) DO NOTHING`,
        consumer,
        eventId,
        now.getTime(),
      );
    },

    pruneReceipts(olderThan) {
      const rows = sql
        .exec<{ event_id: string } & SqlRow>(
          "DELETE FROM consumer_receipts WHERE consumed_at < ? RETURNING event_id",
          olderThan.getTime(),
        )
        .toArray();
      return { deleted: rows.length };
    },
  };
}
