import type {
  DeadLetterInput,
  DeadLetterKey,
  DeadLetterRecord,
} from "../protocol/deadLetters";
import type { SqlExec, SqlRow } from "../sql";
import type { Migration } from "./schema";

/**
 * Messages that exhausted the events queue's retries. The dead-letter
 * consumer records them here instead of dropping them, so an operator can
 * inspect and re-drive them (`spec/domains/index.md`
 * 「トランザクションとドメインイベント」: DLQ からの再投入は運用が行う).
 */
export const DEAD_LETTER_MIGRATION: Migration = {
  version: 3,
  name: "dead letters",
  statements: [
    `CREATE TABLE dead_letters (
      consumer TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      dead_lettered_count INTEGER NOT NULL,
      first_dead_lettered_at INTEGER NOT NULL,
      last_dead_lettered_at INTEGER NOT NULL,
      redriven_at INTEGER,
      PRIMARY KEY (consumer, event_id)
    )`,
    `CREATE INDEX idx_dead_letters_pending
       ON dead_letters (last_dead_lettered_at, consumer, event_id)
       WHERE redriven_at IS NULL`,
  ],
};

type DeadLetterRow = Readonly<{
  consumer: string;
  event_id: string;
  event_type: string;
  aggregate_id: string;
  occurred_at: number;
  payload: string;
  attempts: number;
  dead_lettered_count: number;
  first_dead_lettered_at: number;
  last_dead_lettered_at: number;
  redriven_at: number | null;
}> &
  SqlRow;

const toRecord = (row: DeadLetterRow): DeadLetterRecord => ({
  consumer: row.consumer,
  eventId: row.event_id,
  eventType: row.event_type,
  aggregateId: row.aggregate_id,
  occurredAt: new Date(Number(row.occurred_at)),
  payload: JSON.parse(row.payload) as Record<string, unknown>,
  attempts: Number(row.attempts),
  deadLetteredCount: Number(row.dead_lettered_count),
  firstDeadLetteredAt: new Date(Number(row.first_dead_lettered_at)),
  lastDeadLetteredAt: new Date(Number(row.last_dead_lettered_at)),
  redrivenAt:
    row.redriven_at === null ? null : new Date(Number(row.redriven_at)),
});

/**
 * Records a dead letter. The same (consumer, event) dead-lettering again —
 * typically after a re-drive that failed once more — counts up and becomes
 * pending again.
 */
export function recordDeadLetter(
  sql: SqlExec,
  input: DeadLetterInput,
  now: Date,
): void {
  sql.exec(
    `INSERT INTO dead_letters
       (consumer, event_id, event_type, aggregate_id, occurred_at, payload,
        attempts, dead_lettered_count, first_dead_lettered_at,
        last_dead_lettered_at, redriven_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)
       ON CONFLICT (consumer, event_id) DO UPDATE SET
         attempts = excluded.attempts,
         dead_lettered_count = dead_letters.dead_lettered_count + 1,
         last_dead_lettered_at = excluded.last_dead_lettered_at,
         redriven_at = NULL`,
    input.consumer,
    input.eventId,
    input.eventType,
    input.aggregateId,
    input.occurredAt.getTime(),
    JSON.stringify(input.payload),
    input.attempts,
    now.getTime(),
    now.getTime(),
  );
}

const COLUMNS = `consumer, event_id, event_type, aggregate_id, occurred_at,
  payload, attempts, dead_lettered_count, first_dead_lettered_at,
  last_dead_lettered_at, redriven_at`;

/** Dead letters not yet re-driven, oldest first (at most `limit`). */
export function listPendingDeadLetters(
  sql: SqlExec,
  limit: number,
): readonly DeadLetterRecord[] {
  return sql
    .exec<DeadLetterRow>(
      `SELECT ${COLUMNS} FROM dead_letters
         WHERE redriven_at IS NULL
         ORDER BY last_dead_lettered_at, consumer, event_id
         LIMIT ?`,
      limit,
    )
    .toArray()
    .map(toRecord);
}

/** The pending dead letters among `keys`, in the same order as the list. */
export function findPendingDeadLetters(
  sql: SqlExec,
  keys: readonly DeadLetterKey[],
): readonly DeadLetterRecord[] {
  if (keys.length === 0) return [];
  return sql
    .exec<DeadLetterRow>(
      `SELECT ${COLUMNS} FROM dead_letters
         WHERE redriven_at IS NULL
           AND (consumer, event_id) IN (
             SELECT json_extract(value, '$.consumer'),
                    json_extract(value, '$.eventId')
               FROM json_each(?))
         ORDER BY last_dead_lettered_at, consumer, event_id`,
      JSON.stringify(keys),
    )
    .toArray()
    .map(toRecord);
}

export function markDeadLettersRedriven(
  sql: SqlExec,
  keys: readonly DeadLetterKey[],
  now: Date,
): void {
  for (const key of keys) {
    sql.exec(
      `UPDATE dead_letters SET redriven_at = ?
         WHERE consumer = ? AND event_id = ? AND redriven_at IS NULL`,
      now.getTime(),
      key.consumer,
      key.eventId,
    );
  }
}
