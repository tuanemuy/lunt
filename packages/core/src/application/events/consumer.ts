import type { RequestContainer } from "../di/types";
import type { LuntDomainEvent, LuntEventType } from "./registry";

/**
 * A consumer usecase and the event types it subscribes to. The relay
 * sends one queue message per (event, consumer) pair, so each consumer
 * is retried — and dead-lettered — independently of the others that
 * received the same event.
 *
 * Kept apart from the registry (`./consumers.ts`): a consumer's usecase
 * module imports `defineConsumer`, and the registry imports that module.
 */
export type EventConsumer<TType extends LuntEventType = LuntEventType> =
  Readonly<{
    events: readonly TType[];
    handle(
      container: RequestContainer,
      event: Extract<LuntDomainEvent, { type: TType }>,
    ): Promise<void>;
  }>;

export function defineConsumer<const TType extends LuntEventType>(
  events: readonly [TType, ...TType[]],
  handle: EventConsumer<TType>["handle"],
): EventConsumer<TType> {
  return { events, handle };
}
