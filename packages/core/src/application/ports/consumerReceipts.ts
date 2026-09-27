import type { EventId } from "@repo/core/domain/common/event";

/**
 * Per-consumer record of domain events a consumer has finished handling.
 * Receipts only skip redundant work on redelivery — consumers are
 * idempotent on their own (they judge by the facts at consumption time),
 * so a receipt lost after a successful run costs a repeat, never a
 * wrong result.
 */
export interface ConsumerReceipts {
  isConsumed(consumer: string, eventId: EventId): Promise<boolean>;
  markConsumed(consumer: string, eventId: EventId): Promise<void>;
}
