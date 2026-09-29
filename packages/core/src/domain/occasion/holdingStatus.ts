import type { DateRange } from "@repo/core/domain/common/dateRange";
import { LocalDate } from "@repo/core/domain/common/localDate";

/** Whether the occasion was called off; set and revoked by hand, never by date. */
export type Cancellation = Readonly<{ cancelled: boolean }>;

export const Cancellation = {
  none: { cancelled: false } as Cancellation,
  cancelled: { cancelled: true } as Cancellation,
};

/**
 * 開催前・開催中・終了・中止. Never stored: derived from the period, the
 * cancellation and today (`HoldingStatus.of`).
 */
export type HoldingStatus = "upcoming" | "ongoing" | "ended" | "cancelled";

const ALL: readonly HoldingStatus[] = [
  "upcoming",
  "ongoing",
  "ended",
  "cancelled",
];

/**
 * Cancelled first; no period → `null` (undetermined — never for a
 * published occasion); then today against the inclusive period.
 */
function of(
  period: DateRange | null,
  cancellation: Cancellation,
  today: LocalDate,
): HoldingStatus | null {
  if (cancellation.cancelled) return "cancelled";
  if (period === null) return null;
  if (today < period.start) return "upcoming";
  if (today <= period.end) return "ongoing";
  return "ended";
}

// An occasion ending on the last representable day never turns `ended`.
const LAST_DAY = LocalDate.parse("9999-12-31");

/**
 * The next day `of` would answer differently while the period and the
 * cancellation stay as they are: the start for `upcoming`, the day after
 * the end for `ongoing` (`null` when the end is 9999-12-31), `null`
 * otherwise (dates alone never change it).
 */
function nextChangeOn(
  period: DateRange | null,
  cancellation: Cancellation,
  today: LocalDate,
): LocalDate | null {
  const status = of(period, cancellation, today);
  if (period === null) return null;
  switch (status) {
    case "upcoming":
      return period.start;
    case "ongoing":
      return period.end === LAST_DAY ? null : LocalDate.addDays(period.end, 1);
    default:
      return null;
  }
}

export const HoldingStatus = {
  all: ALL,
  is: (value: string): value is HoldingStatus =>
    ALL.some((status) => status === value),
  of,
  nextChangeOn,
};
