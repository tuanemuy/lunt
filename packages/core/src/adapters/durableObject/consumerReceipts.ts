import type { ConsumerReceipts } from "@repo/core/application/ports/consumerReceipts";
import type { EventId } from "@repo/core/domain/common/event";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";

/** Consumer-side face of the DO-local `consumer_receipts` table. */
export class DoConsumerReceipts implements ConsumerReceipts {
  constructor(
    private readonly client: Pick<
      LuntStateClient,
      "isConsumed" | "markConsumed"
    >,
  ) {}

  isConsumed(consumer: string, eventId: EventId): Promise<boolean> {
    return mapDoError("Failed to read consumer receipt", () =>
      this.client.isConsumed(consumer, eventId),
    );
  }

  markConsumed(consumer: string, eventId: EventId): Promise<void> {
    return mapDoError("Failed to record consumer receipt", () =>
      this.client.markConsumed(consumer, eventId),
    );
  }
}
