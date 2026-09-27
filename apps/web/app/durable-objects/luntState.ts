import { DurableObject } from "cloudflare:workers";
import type { Queue } from "@cloudflare/workers-types";
import { runOutboxAlarmTick } from "@repo/core/adapters/do/alarm";
import {
  type RedriveTarget,
  redriveDeadLetters,
} from "@repo/core/adapters/do/deadLetterRedrive";
import {
  DoSqliteOutboxRepository,
  nextOutboxWakeUpAt,
  requeueParkedOutboxEvents,
} from "@repo/core/adapters/do/outboxStore";
import type {
  CommitRequest,
  CommitResult,
} from "@repo/core/adapters/do/protocol/client";
import type {
  DeadLetterInput,
  DeadLetterRecord,
  RedriveResult,
} from "@repo/core/adapters/do/protocol/deadLetters";
import type {
  QueryArgs,
  QueryName,
  QueryResult,
} from "@repo/core/adapters/do/protocol/queries";
import {
  listPendingDeadLetters,
  recordDeadLetter,
} from "@repo/core/adapters/do/store/deadLetters";
import { applyMigrations } from "@repo/core/adapters/do/store/schema";
import {
  createStateStore,
  type StateStore,
} from "@repo/core/adapters/do/store/stateStore";
import {
  readPruneTuning,
  readRelayTuning,
  type TuningEnv,
} from "@repo/core/application/di/env";
import type { WorkerContainer } from "@repo/core/application/di/types";
import {
  type ConsumerRegistry,
  consumers,
} from "@repo/core/application/events/consumers";
import {
  type EventDecoderRegistry,
  eventDecoders,
} from "@repo/core/application/events/registry";
import { SystemClock } from "@repo/core/application/ports/clock";
import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";
import { ConsoleLogger } from "@repo/core/application/ports/logger";
import {
  createFanOutDispatcher,
  type EventMessage,
} from "@repo/core/application/workers/eventDelivery";

export type LuntStateEnv = TuningEnv &
  Readonly<{
    EVENTS_QUEUE: Queue<EventMessage>;
  }>;

/**
 * The single, global SQLite-backed Durable Object that holds every Lunt
 * aggregate, the outbox and the consumer receipts (design.md D-02).
 *
 * - **State**: `query` runs a named read, `commit` applies a whole unit
 *   of work in one `transactionSync`.
 * - **Relay**: `alarm()` drains the outbox to the events queue, one
 *   message per subscribed consumer, then prunes; commit arms it
 *   whenever it stores events, and each tick re-arms while rows remain.
 * - **Receipts**: consumers check and record per-consumer receipts here.
 * - **Dead letters**: messages that exhausted the queue's retries are kept
 *   here, and re-driven to their consumers on an operator's request.
 */
export class LuntStateObject extends DurableObject<LuntStateEnv> {
  private readonly store: StateStore;

  constructor(ctx: DurableObjectState, env: LuntStateEnv) {
    super(ctx, env);
    const transaction = <T>(fn: () => T): T => ctx.storage.transactionSync(fn);
    applyMigrations(ctx.storage.sql, transaction, SystemClock.now());
    this.store = createStateStore(ctx.storage.sql, transaction);
  }

  async query<K extends QueryName>(
    name: K,
    args: QueryArgs<K>,
  ): Promise<QueryResult<K>> {
    return this.store.query(name, args);
  }

  async commit(request: CommitRequest): Promise<CommitResult> {
    const result = this.store.commit(request, SystemClock.now());
    if (result.kind === "committed" && request.events.length > 0) {
      await this.armAlarmAsap();
    }
    return result;
  }

  async isConsumed(consumer: string, eventId: string): Promise<boolean> {
    return this.store.isConsumed(consumer, eventId);
  }

  async markConsumed(consumer: string, eventId: string): Promise<void> {
    this.store.markConsumed(consumer, eventId, SystemClock.now());
  }

  /** Operator escape hatch: requeue parked rows and relay now. */
  async kickRelay(): Promise<void> {
    requeueParkedOutboxEvents(this.ctx.storage.sql);
    await this.armAlarmAsap();
  }

  async recordDeadLetter(input: DeadLetterInput): Promise<void> {
    recordDeadLetter(this.ctx.storage.sql, input, SystemClock.now());
  }

  async listDeadLetters(limit: number): Promise<readonly DeadLetterRecord[]> {
    return listPendingDeadLetters(this.ctx.storage.sql, limit);
  }

  async redriveDeadLetters(target: RedriveTarget): Promise<RedriveResult> {
    return redriveDeadLetters(
      {
        sql: this.ctx.storage.sql,
        decoders: this.relayRegistries().decoders,
        sendBatch: (messages) => this.sendToEventsQueue(messages),
        now: () => SystemClock.now(),
      },
      target,
    );
  }

  override async alarm(): Promise<void> {
    const sql = this.ctx.storage.sql;
    const relayTuning = readRelayTuning(this.env);
    const { retentionMs } = readPruneTuning(this.env);
    const container: WorkerContainer = {
      clock: SystemClock,
      idGenerator: UuidV7Generator,
      logger: ConsoleLogger,
      outboxRepository: new DoSqliteOutboxRepository(
        sql,
        UuidV7Generator,
        SystemClock,
      ),
    };
    const registries = this.relayRegistries();
    const dispatch = createFanOutDispatcher(registries.consumers, (messages) =>
      this.sendToEventsQueue(messages),
    );
    await runOutboxAlarmTick({
      container,
      dispatch,
      relayTuning: { ...relayTuning, decoderRegistry: registries.decoders },
      retentionMs,
      nextWakeUpAt: () => nextOutboxWakeUpAt(sql, relayTuning.leaseMs),
      setAlarm: (at) => this.ctx.storage.setAlarm(at),
    });
    this.store.pruneReceipts(
      new Date(SystemClock.now().getTime() - retentionMs),
    );
  }

  /**
   * The decoders and consumers the relay routes with. Integration tests
   * override this to relay a test-only event type end to end.
   */
  protected relayRegistries(): Readonly<{
    decoders: EventDecoderRegistry;
    consumers: ConsumerRegistry;
  }> {
    return { decoders: eventDecoders, consumers };
  }

  private async sendToEventsQueue(
    messages: readonly EventMessage[],
  ): Promise<void> {
    await this.env.EVENTS_QUEUE.sendBatch(messages.map((body) => ({ body })));
  }

  private async armAlarmAsap(): Promise<void> {
    const now = SystemClock.now();
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > now.getTime()) {
      await this.ctx.storage.setAlarm(now);
    }
  }
}
