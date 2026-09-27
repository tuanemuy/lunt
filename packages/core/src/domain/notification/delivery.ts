import type { StewardedRef } from "@repo/core/domain/common/refs";
import { Addressing } from "./addressing";
import type {
  DirectAudienceOccurrence,
  StewardAudienceOccurrence,
} from "./occurrence";

/**
 * Whether an occurrence reached the audience it names (`direct`) or the
 * operators stood in for a target without stewards (`proxy`, I-16).
 */
export type Delivery = "direct" | "proxy";

/**
 * An occurrence and how it was delivered. `proxy` is only representable for
 * occurrences addressed to a target's stewards.
 */
export type DeliveredOccurrence =
  | Readonly<{ occurrence: StewardAudienceOccurrence; delivery: Delivery }>
  | Readonly<{ occurrence: DirectAudienceOccurrence; delivery: "direct" }>;

/** The target without stewards a `proxy` delivery stood in for; `null` when `direct`. */
function vacantTarget(d: DeliveredOccurrence): StewardedRef | null {
  return d.delivery === "proxy"
    ? Addressing.stewardsOf(d.occurrence).target
    : null;
}

export const DeliveredOccurrence = { vacantTarget };
