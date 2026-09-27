import type { Clock } from "@repo/core/application/ports/clock";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type {
  ClaimPendingArgs,
  FinalizeOutboxArgs,
  OutboxEntry,
  OutboxRepository,
} from "@repo/core/application/ports/outboxRepository";
import type { DomainEvent } from "@repo/core/domain/common/event";
import type { SqlExec, SqlRow } from "./sql";

type OutboxDbRow = Readonly<{
  id: string;
  event_type: string;
  aggregate_id: string;
  payload: string;
  occurred_at: number;
  created_at: number;
  attempts: number;
}> &
  SqlRow;

/**
 * DO-local implementation of `OutboxRepository`, consumed by the SAME
 * `processOutboxEvents` relay worker the other runtimes use — the swap
 * is "where the relay runs" (the DO's alarm instead of a sibling
 * Worker), not the drain policy.
 *
 * A Durable Object is single-threaded, so the claim/lease machinery is
 * not fighting concurrent workers here; it is kept because the port
 * contract still needs it for crash coverage — an alarm invocation
 * that dies between claim and finalize leaves its rows invisible until
 * the lease lapses, at which point the platform-retried alarm picks
 * them up again.
 */
export class DoSqliteOutboxRepository implements OutboxRepository {
  constructor(
    private readonly sql: SqlExec,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    /** Told about each row parked because it is corrupt, for the logs. */
    private readonly onCorruptRow: (
      id: string,
      reason: string,
    ) => void = () => {},
  ) {}

  // The commit path inserts outbox rows inside the unit-of-work
  // transaction (`StateStore.commit`); this method exists to satisfy the
  // port for callers that persist events outside a unit of work.
  async save(events: readonly DomainEvent[]): Promise<void> {
    const now = this.clock.now();
    for (const event of events) {
      this.sql.exec(
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
  }

  async claimPending(args: ClaimPendingArgs): Promise<readonly OutboxEntry[]> {
    const { limit, now, workerId, leaseMs } = args;
    const claimCutoff = now.getTime() - leaseMs;
    // SELECT then UPDATE without an intervening await — single-threaded
    // execution makes the pair atomic without an explicit transaction.
    const rows = this.sql
      .exec<OutboxDbRow>(
        `SELECT id, event_type, aggregate_id, payload, occurred_at, created_at, attempts
           FROM outbox_events
           WHERE processed_at IS NULL AND failed_at IS NULL
             AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
             AND (claimed_at IS NULL OR claimed_at <= ?)
           ORDER BY created_at, id LIMIT ?`,
        now.getTime(),
        claimCutoff,
        limit,
      )
      .toArray();
    const entries: OutboxEntry[] = [];
    for (const row of rows) {
      const entry = this.toEntry(row);
      if (entry.kind === "corrupt") {
        // A row no relay can ever deliver (a malformed id, a payload that
        // is not JSON) is parked on its own, so it cannot hold back the
        // rows claimed with it. `kickRelay` puts parked rows back in line
        // once an operator has repaired them.
        this.sql.exec(
          `UPDATE outbox_events
             SET failed_at = ?, last_error = ?, claimed_at = NULL, claimed_by = NULL
             WHERE id = ?`,
          now.getTime(),
          entry.reason,
          row.id,
        );
        this.onCorruptRow(row.id, entry.reason);
        continue;
      }
      this.sql.exec(
        "UPDATE outbox_events SET claimed_at = ?, claimed_by = ? WHERE id = ?",
        now.getTime(),
        workerId,
        row.id,
      );
      entries.push(entry.value);
    }
    return entries;
  }

  private toEntry(
    row: OutboxDbRow,
  ):
    | Readonly<{ kind: "valid"; value: OutboxEntry }>
    | Readonly<{ kind: "corrupt"; reason: string }> {
    if (this.idGenerator.parse(row.id) === null) {
      return { kind: "corrupt", reason: `malformed event id: ${row.id}` };
    }
    let payload: unknown;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      return { kind: "corrupt", reason: "payload is not JSON" };
    }
    return {
      kind: "valid",
      value: {
        id: row.id,
        type: row.event_type,
        payload,
        occurredAt: new Date(Number(row.occurred_at)),
        aggregateId: row.aggregate_id,
        attempts: Number(row.attempts),
      },
    };
  }

  async finalize(args: FinalizeOutboxArgs): Promise<void> {
    const { processed, failures, now } = args;
    for (const id of processed) {
      this.sql.exec(
        `UPDATE outbox_events
           SET processed_at = ?, claimed_at = NULL, claimed_by = NULL
           WHERE id = ? AND processed_at IS NULL`,
        now.getTime(),
        id,
      );
    }
    for (const failure of failures) {
      this.sql.exec(
        `UPDATE outbox_events
           SET attempts = attempts + 1,
               last_error = ?,
               next_attempt_at = ?,
               claimed_at = NULL,
               claimed_by = NULL
           WHERE id = ? AND processed_at IS NULL AND failed_at IS NULL`,
        failure.error,
        failure.nextAttemptAt.getTime(),
        failure.id,
      );
    }
  }

  async pruneProcessed(olderThan: Date): Promise<{ deleted: number }> {
    const rows = this.sql
      .exec(
        `DELETE FROM outbox_events
           WHERE processed_at IS NOT NULL AND processed_at < ?
           RETURNING id`,
        olderThan.getTime(),
      )
      .toArray();
    return { deleted: rows.length };
  }
}

/**
 * Puts rows parked by an earlier relay version (`failed_at` set, which the
 * current relay never does) back in line, due now. Run by `kickRelay`.
 */
export function requeueParkedOutboxEvents(sql: SqlExec): { requeued: number } {
  const rows = sql
    .exec(
      `UPDATE outbox_events
         SET failed_at = NULL, next_attempt_at = NULL
         WHERE failed_at IS NOT NULL AND processed_at IS NULL
         RETURNING id`,
    )
    .toArray();
  return { requeued: rows.length };
}

/**
 * Earliest instant at which a pending outbox row becomes actionable,
 * or `null` when nothing is pending — drives the alarm re-arm after
 * each relay pass. Unclaimed rows are due at `next_attempt_at` (or
 * immediately when fresh); rows still holding a claim — only possible
 * after a crash mid-alarm — become actionable when the lease lapses.
 */
export function nextOutboxWakeUpAt(sql: SqlExec, leaseMs: number): Date | null {
  const rows = sql
    .exec<{ wake: number | null } & SqlRow>(
      `SELECT MIN(CASE WHEN claimed_at IS NOT NULL THEN claimed_at + ?
                       ELSE COALESCE(next_attempt_at, 0) END) AS wake
         FROM outbox_events
         WHERE processed_at IS NULL AND failed_at IS NULL`,
      leaseMs,
    )
    .toArray();
  const wake = rows[0]?.wake;
  return wake === null || wake === undefined ? null : new Date(Number(wake));
}
