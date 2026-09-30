import { reassessApplicationPremises } from "../application/reassessApplicationPremises";
import { withdrawApplicationsOfWithdrawnAccount } from "../application/withdrawApplicationsOfWithdrawnAccount";
import { purgeBookmarksOnWithdrawal } from "../bookmark/purgeBookmarksOnWithdrawal";
import { discardReleasedPhotos } from "../media/discardReleasedPhotos";
import { deliverNotifications } from "../notification/deliverNotifications";
import { purgeNotificationsOnWithdrawal } from "../notification/purgeNotificationsOnWithdrawal";
import { sendTakedownOutcome } from "../notification/sendTakedownOutcome";
import type { EventConsumer } from "./consumer";
import type { LuntEventType } from "./registry";

export type { EventConsumer } from "./consumer";

/**
 * Registered consumers, keyed by the consumer usecase's name. The name
 * travels in the queue message and keys the consumer's idempotency
 * receipts, so renaming a consumer is a data migration.
 */
export const consumers = {
  deliverNotifications,
  discardReleasedPhotos,
  purgeBookmarksOnWithdrawal,
  purgeNotificationsOnWithdrawal,
  reassessApplicationPremises,
  sendTakedownOutcome,
  withdrawApplicationsOfWithdrawnAccount,
} satisfies Readonly<Record<string, EventConsumer>>;

export type ConsumerName = keyof typeof consumers & string;

type ConsumerLedger = Readonly<Record<string, EventConsumer>>;

// Mapped per name: with no consumer registered, a bare
// `R[never] extends EventConsumer<infer T>` would infer `T` as its
// constraint and count every event as subscribed.
type SubscribedTypeOf<R extends ConsumerLedger> = {
  [K in keyof R]: R[K] extends EventConsumer<infer T> ? T : never;
}[keyof R];

/** Event types no consumer in `R` subscribes to. */
export type UnsubscribedEventTypeOf<R extends ConsumerLedger> = Exclude<
  LuntEventType,
  SubscribedTypeOf<R>
>;

/**
 * `true` when every event type has a consumer in `R`, otherwise the
 * event types left without one — so assigning `true` to it fails to
 * compile and the error names them.
 */
export type EveryEventSubscribed<R extends ConsumerLedger> = [
  UnsubscribedEventTypeOf<R>,
] extends [never]
  ? true
  : UnsubscribedEventTypeOf<R>;

/** Event types no registered consumer subscribes to — must stay empty. */
export type UnsubscribedEventType = UnsubscribedEventTypeOf<typeof consumers>;

const everyEventHasAConsumer: EveryEventSubscribed<typeof consumers> = true;
void everyEventHasAConsumer;

export type ConsumerRegistry = Readonly<
  Record<string, EventConsumer | undefined>
>;

/** Consumer names subscribed to `type`, in registry order. */
export function subscribersOf(
  registry: ConsumerRegistry,
  type: string,
): readonly string[] {
  return Object.entries(registry)
    .filter(([, consumer]) =>
      (consumer?.events as readonly string[] | undefined)?.includes(type),
    )
    .map(([name]) => name);
}
