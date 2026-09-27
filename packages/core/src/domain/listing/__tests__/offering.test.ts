import { LocalDate } from "@repo/core/domain/common/localDate";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "../../common/__tests__/expectBusinessError";
import {
  ManualEnd,
  Offering,
  OfferingPeriod,
  OfferingStatus,
  OpenDates,
} from "../offering";

const d = LocalDate.parse;
const period = (start: string | null, end: string | null): Offering => ({
  kind: "period",
  period: OfferingPeriod.create({
    start: start === null ? null : d(start),
    end: end === null ? null : d(end),
  }),
});
const openDates = (...days: string[]): Offering => ({
  kind: "dates",
  dates: OpenDates.create(days.map(d)),
});
const today = d("2026-07-10");
const none = ManualEnd.none();
const ended = ManualEnd.ended();

describe("OfferingPeriod.create", () => {
  it("accepts a start, an end, both, and the same day twice", () => {
    expect(
      OfferingPeriod.create({ start: d("2026-07-01"), end: null }),
    ).toEqual({ start: "2026-07-01", end: null });
    expect(
      OfferingPeriod.create({ start: null, end: d("2026-07-01") }),
    ).toEqual({ start: null, end: "2026-07-01" });
    expect(
      OfferingPeriod.create({ start: d("2026-07-01"), end: d("2026-07-01") }),
    ).toEqual({ start: "2026-07-01", end: "2026-07-01" });
  });

  it("refuses neither day and an end before the start", () => {
    expectBusinessError(
      () => OfferingPeriod.create({ start: null, end: null }),
      "LISTING_INVALID_OFFERING_PERIOD",
    );
    expectBusinessError(
      () =>
        OfferingPeriod.create({ start: d("2026-07-02"), end: d("2026-07-01") }),
      "LISTING_INVALID_OFFERING_PERIOD",
    );
  });
});

describe("OpenDates.create", () => {
  it("sorts, de-duplicates and keeps past days", () => {
    expect(
      OpenDates.create([d("2026-08-03"), d("2026-06-01"), d("2026-08-03")]),
    ).toEqual(["2026-06-01", "2026-08-03"]);
  });

  it("refuses no day", () => {
    expectBusinessError(
      () => OpenDates.create([]),
      "LISTING_INVALID_OPEN_DATES",
    );
  });
});

describe("Offering boundary days", () => {
  it("startsOn is a period's start only; lastAvailableOn a period's end or the last open date", () => {
    expect(Offering.startsOn(period("2026-07-20", "2026-08-31"))).toBe(
      "2026-07-20",
    );
    expect(Offering.startsOn(openDates("2026-07-20"))).toBeNull();
    expect(Offering.startsOn(Offering.none())).toBeNull();
    expect(Offering.lastAvailableOn(period("2026-07-20", "2026-08-31"))).toBe(
      "2026-08-31",
    );
    expect(Offering.lastAvailableOn(period("2026-07-20", null))).toBeNull();
    expect(
      Offering.lastAvailableOn(openDates("2026-07-27", "2026-07-20")),
    ).toBe("2026-07-27");
  });
});

describe("OfferingStatus.of", () => {
  it.each([
    [Offering.none(), { phase: "available" }],
    [period("2026-07-20", null), { phase: "upcoming", startsOn: "2026-07-20" }],
    [period("2026-07-10", null), { phase: "available" }],
    [period(null, "2026-07-10"), { phase: "available" }],
    [period(null, "2026-07-09"), { phase: "ended", cause: "schedule" }],
    [openDates("2026-07-20"), { phase: "available" }],
    [
      openDates("2026-06-20", "2026-07-09"),
      { phase: "ended", cause: "schedule" },
    ],
  ])("%j → %j", (offering, status) => {
    expect(OfferingStatus.of(offering, none, today)).toEqual(status);
  });

  it("a manual end is ended whatever the schedule, telling whether the schedule has elapsed too", () => {
    expect(OfferingStatus.of(period("2026-07-20", null), ended, today)).toEqual(
      {
        phase: "ended",
        cause: "manual",
        scheduleElapsed: false,
      },
    );
    expect(OfferingStatus.of(period(null, "2026-06-30"), ended, today)).toEqual(
      {
        phase: "ended",
        cause: "manual",
        scheduleElapsed: true,
      },
    );
  });
});

describe("OfferingStatus.nextChangeOn", () => {
  it.each([
    [Offering.none(), none, null],
    [period("2026-07-20", "2026-08-31"), none, "2026-07-20"],
    [period(null, "2026-08-31"), none, "2026-09-01"],
    [period(null, "2026-07-10"), none, "2026-07-11"],
    [period(null, "2026-07-09"), none, null],
    [openDates("2026-07-25"), none, "2026-07-26"],
    [period(null, "2026-08-31"), ended, null],
  ] as const)("%j %j → %s", (offering, manual, next) => {
    expect(OfferingStatus.nextChangeOn(offering, manual, today)).toBe(next);
  });

  it("the phase on the returned day differs from today's, and not before it", () => {
    const offerings = [
      period("2026-07-20", "2026-08-31"),
      period(null, "2026-07-12"),
      openDates("2026-07-11", "2026-07-15"),
    ];
    for (const offering of offerings) {
      const next = OfferingStatus.nextChangeOn(offering, none, today);
      if (next === null) throw new Error("expected a change");
      const phase = (day: LocalDate) =>
        OfferingStatus.of(offering, none, day).phase;
      expect(phase(next)).not.toBe(phase(today));
      expect(phase(LocalDate.addDays(next, -1))).toBe(phase(today));
    }
  });
});
