/** Identifies a dead letter: one event that one consumer could not handle. */
export type DeadLetterKey = Readonly<{ consumer: string; eventId: string }>;

/**
 * A message that exhausted the events queue's retries, as the dead-letter
 * consumer hands it to the state object. The event is kept in its stored
 * form (payload as plain JSON) and decoded again on re-drive, exactly as
 * the relay decodes outbox rows.
 */
export type DeadLetterInput = DeadLetterKey &
  Readonly<{
    eventType: string;
    aggregateId: string;
    occurredAt: Date;
    payload: Record<string, unknown>;
    /** Queue delivery attempts the message had used up. */
    attempts: number;
  }>;

export type DeadLetterRecord = DeadLetterInput &
  Readonly<{
    /** How many times this (consumer, event) reached the dead-letter queue. */
    deadLetteredCount: number;
    firstDeadLetteredAt: Date;
    lastDeadLetteredAt: Date;
    /** Set when an operator re-drove it; cleared if it dead-letters again. */
    redrivenAt: Date | null;
  }>;

export type RedriveResult = Readonly<{
  redriven: readonly DeadLetterKey[];
  failed: readonly (DeadLetterKey & Readonly<{ error: string }>)[];
}>;
