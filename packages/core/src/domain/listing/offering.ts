import { LocalDate } from "@repo/core/domain/common/localDate";
import { BusinessRuleError } from "@repo/core/domain/error";
import { ListingErrorCode } from "./errorCode";

/** A start day, an end day, or both (`end` not before `start`). */
export type OfferingPeriod =
  | Readonly<{ start: LocalDate; end: LocalDate }>
  | Readonly<{ start: LocalDate; end: null }>
  | Readonly<{ start: null; end: LocalDate }>;

/** One or more days, ascending, without repeats. No times, seats or bookings. */
export type OpenDates = readonly [LocalDate, ...LocalDate[]];

/** How a listing is offered: not set, a period, or open dates (exclusive). */
export type Offering =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "period"; period: OfferingPeriod }>
  | Readonly<{ kind: "dates"; dates: OpenDates }>;

/** Whether a manager ended the offering by hand (it can be resumed). */
export type ManualEnd = Readonly<{ ended: boolean }>;

export type OfferingPhase = "upcoming" | "available" | "ended";

/**
 * The offering state on a day. Never stored: `OfferingStatus.of` derives it
 * from the offering, the manual end and today. An end tells a schedule end
 * from a manual one; a manual end tells whether the schedule has also
 * elapsed (resuming then leaves it ended).
 */
export type OfferingStatus =
  | Readonly<{ phase: "upcoming"; startsOn: LocalDate }>
  | Readonly<{ phase: "available" }>
  | Readonly<{ phase: "ended"; cause: "schedule" }>
  | Readonly<{ phase: "ended"; cause: "manual"; scheduleElapsed: boolean }>;

const invalidPeriod = (): BusinessRuleError<ListingErrorCode> =>
  new BusinessRuleError(
    ListingErrorCode.InvalidOfferingPeriod,
    "An offering period needs a start or an end, and the end may not precede the start",
  );

export const OfferingPeriod = {
  /** Throws `LISTING_INVALID_OFFERING_PERIOD` with neither day, or with `end` before `start`. */
  create: (
    input: Readonly<{ start: LocalDate | null; end: LocalDate | null }>,
  ): OfferingPeriod => {
    const { start, end } = input;
    if (start !== null && end !== null) {
      if (LocalDate.isBefore(end, start)) throw invalidPeriod();
      return { start, end };
    }
    if (start !== null) return { start, end: null };
    if (end !== null) return { start: null, end };
    throw invalidPeriod();
  },
  equals: (a: OfferingPeriod, b: OfferingPeriod): boolean =>
    a.start === b.start && a.end === b.end,
};

export const OpenDates = {
  /** Sorts and de-duplicates; past days are accepted. Throws `LISTING_INVALID_OPEN_DATES` when empty. */
  create: (input: readonly LocalDate[]): OpenDates => {
    const [first, ...rest] = [...new Set(input)].sort(LocalDate.compare);
    if (first === undefined) {
      throw new BusinessRuleError(
        ListingErrorCode.InvalidOpenDates,
        "Open dates need at least one day",
      );
    }
    return [first, ...rest];
  },
  equals: (a: OpenDates, b: OpenDates): boolean =>
    a.length === b.length && a.every((date, i) => date === b[i]),
};

const NONE: Offering = { kind: "none" };

/**
 * The day `upcoming` ends: a period's start. `null` otherwise — open dates
 * are `available` before the first date too.
 */
function startsOn(offering: Offering): LocalDate | null {
  return offering.kind === "period" ? offering.period.start : null;
}

/** The last day the offering is `available`: a period's end, or the last open date. */
function lastAvailableOn(offering: Offering): LocalDate | null {
  switch (offering.kind) {
    case "none":
      return null;
    case "period":
      return offering.period.end;
    case "dates":
      return offering.dates[offering.dates.length - 1] ?? null;
  }
}

export const Offering = {
  none: (): Offering => NONE,
  startsOn,
  lastAvailableOn,
  equals: (a: Offering, b: Offering): boolean => {
    switch (a.kind) {
      case "none":
        return b.kind === "none";
      case "period":
        return b.kind === "period" && OfferingPeriod.equals(a.period, b.period);
      case "dates":
        return b.kind === "dates" && OpenDates.equals(a.dates, b.dates);
    }
  },
};

export const ManualEnd = {
  none: (): ManualEnd => ({ ended: false }),
  ended: (): ManualEnd => ({ ended: true }),
};

type SchedulePhase =
  | Readonly<{ phase: "upcoming"; startsOn: LocalDate }>
  | Readonly<{ phase: "available" }>
  | Readonly<{ phase: "ended" }>;

function scheduleOf(offering: Offering, today: LocalDate): SchedulePhase {
  const start = startsOn(offering);
  if (start !== null && LocalDate.isBefore(today, start)) {
    return { phase: "upcoming", startsOn: start };
  }
  const last = lastAvailableOn(offering);
  if (last !== null && LocalDate.isBefore(last, today)) {
    return { phase: "ended" };
  }
  return { phase: "available" };
}

/** The only place the offering state is decided. */
function of(
  offering: Offering,
  manualEnd: ManualEnd,
  today: LocalDate,
): OfferingStatus {
  const schedule = scheduleOf(offering, today);
  if (manualEnd.ended) {
    return {
      phase: "ended",
      cause: "manual",
      scheduleElapsed: schedule.phase === "ended",
    };
  }
  return schedule.phase === "ended"
    ? { phase: "ended", cause: "schedule" }
    : schedule;
}

/**
 * The first day after `today` whose phase differs from today's, or `null`
 * when it never changes (a manual end, or a schedule already past).
 */
function nextChangeOn(
  offering: Offering,
  manualEnd: ManualEnd,
  today: LocalDate,
): LocalDate | null {
  if (manualEnd.ended) return null;
  const start = startsOn(offering);
  if (start !== null && LocalDate.isBefore(today, start)) return start;
  const last = lastAvailableOn(offering);
  if (last !== null && !LocalDate.isAfter(today, last)) {
    return LocalDate.addDays(last, 1);
  }
  return null;
}

export const OfferingStatus = { of, nextChangeOn };

const OFFERING_PHASES = [
  "upcoming",
  "available",
  "ended",
] as const satisfies readonly OfferingPhase[];

export const OfferingPhase = {
  all: OFFERING_PHASES,
  is: (value: string): value is OfferingPhase =>
    (OFFERING_PHASES as readonly string[]).includes(value),
};
