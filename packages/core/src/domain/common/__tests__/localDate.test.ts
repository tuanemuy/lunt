import { LocalDate } from "@repo/core/domain/common/localDate";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

const CODE = "COMMON_INVALID_LOCAL_DATE";

describe("LocalDate.fromInstant (Japan time, fixed UTC+9)", () => {
  it.each([
    [
      "UTC 14:59:59.999 is still the same JST day",
      "2026-03-31T14:59:59.999Z",
      "2026-03-31",
    ],
    ["UTC 15:00 is the next JST day", "2026-03-31T15:00:00.000Z", "2026-04-01"],
    ["year boundary", "2025-12-31T15:00:00.000Z", "2026-01-01"],
    ["leap day", "2028-02-28T15:30:00.000Z", "2028-02-29"],
    [
      "UTC midnight is 09:00 JST the same day",
      "2026-07-01T00:00:00.000Z",
      "2026-07-01",
    ],
  ])("%s", (_label, iso, expected) => {
    expect(LocalDate.fromInstant(new Date(iso))).toBe(expected);
  });

  it("does not depend on the process time zone (no DST)", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("2000-01-01T00:00:00Z"),
          max: new Date("2100-01-01T00:00:00Z"),
          noInvalidDate: true,
        }),
        (d) => {
          const shifted = new Date(d.getTime() + 9 * 3600 * 1000);
          expect(LocalDate.fromInstant(d)).toBe(
            shifted.toISOString().slice(0, 10),
          );
        },
      ),
    );
  });
});

describe("LocalDate parse / fromParts", () => {
  it("round-trips YYYY-MM-DD", () => {
    expect(LocalDate.parse("2026-09-28")).toBe("2026-09-28");
    expect(LocalDate.format(LocalDate.parse("2026-09-28"))).toBe("2026-09-28");
    expect(LocalDate.toParts(LocalDate.parse("2026-09-28"))).toEqual({
      year: 2026,
      month: 9,
      day: 28,
    });
    expect(LocalDate.fromParts({ year: 7, month: 1, day: 2 })).toBe(
      "0007-01-02",
    );
  });

  it.each([
    ["non-existent day", "2026-02-30"],
    ["non-leap Feb 29", "2027-02-29"],
    ["month 13", "2026-13-01"],
    ["day 0", "2026-01-00"],
    ["unpadded", "2026-9-28"],
    ["timestamp", "2026-09-28T00:00:00Z"],
    ["slashes", "2026/09/28"],
    ["year 0", "0000-01-01"],
    ["empty", ""],
  ])("rejects %s", (_label, input) => {
    expectBusinessError(() => LocalDate.parse(input), CODE);
  });

  it("rejects non-integer parts", () => {
    expectBusinessError(
      () => LocalDate.fromParts({ year: 2026, month: 1.5, day: 1 }),
      CODE,
    );
  });
});

describe("LocalDate comparison is calendar order", () => {
  const a = LocalDate.parse("2026-09-28");
  const b = LocalDate.parse("2026-10-01");

  it("compare / isBefore / isAfter / equals / min / max", () => {
    expect(LocalDate.compare(a, b)).toBe(-1);
    expect(LocalDate.compare(b, a)).toBe(1);
    expect(LocalDate.compare(a, a)).toBe(0);
    expect(LocalDate.isBefore(a, b)).toBe(true);
    expect(LocalDate.isAfter(a, b)).toBe(false);
    expect(LocalDate.equals(a, LocalDate.parse("2026-09-28"))).toBe(true);
    expect(LocalDate.min(a, b)).toBe(a);
    expect(LocalDate.max(a, b)).toBe(b);
  });

  it("addDays crosses month / year / leap boundaries", () => {
    expect(LocalDate.addDays(LocalDate.parse("2026-12-31"), 1)).toBe(
      "2027-01-01",
    );
    expect(LocalDate.addDays(LocalDate.parse("2028-02-28"), 1)).toBe(
      "2028-02-29",
    );
    expect(LocalDate.addDays(LocalDate.parse("2026-03-01"), -1)).toBe(
      "2026-02-28",
    );
  });

  it("daysBetween inverts addDays", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("1900-01-01T00:00:00Z"),
          max: new Date("2200-01-01T00:00:00Z"),
          noInvalidDate: true,
        }),
        fc.integer({ min: -3000, max: 3000 }),
        (d, n) => {
          const start = LocalDate.fromInstant(d);
          const end = LocalDate.addDays(start, n);
          expect(LocalDate.daysBetween(start, end)).toBe(n);
          expect(LocalDate.compare(end, start)).toBe(Math.sign(n) || 0);
        },
      ),
    );
  });
});
