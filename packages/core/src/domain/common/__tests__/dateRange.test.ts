import { DateRange } from "@repo/core/domain/common/dateRange";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

const d = LocalDate.parse;

describe("DateRange.create (start <= end, inclusive)", () => {
  it("accepts start before end and a single-day range", () => {
    expect(DateRange.create(d("2026-10-01"), d("2026-10-03"))).toEqual({
      start: "2026-10-01",
      end: "2026-10-03",
    });
    expect(DateRange.create(d("2026-10-01"), d("2026-10-01"))).toEqual({
      start: "2026-10-01",
      end: "2026-10-01",
    });
  });

  it("rejects end before start with COMMON_INVALID_DATE_RANGE", () => {
    expectBusinessError(
      () => DateRange.create(d("2026-10-02"), d("2026-10-01")),
      "COMMON_INVALID_DATE_RANGE",
    );
  });

  it("contains includes both ends", () => {
    const range = DateRange.create(d("2026-10-01"), d("2026-10-03"));
    expect(DateRange.contains(range, d("2026-09-30"))).toBe(false);
    expect(DateRange.contains(range, d("2026-10-01"))).toBe(true);
    expect(DateRange.contains(range, d("2026-10-03"))).toBe(true);
    expect(DateRange.contains(range, d("2026-10-04"))).toBe(false);
  });

  it("equals compares both ends", () => {
    const range = DateRange.create(d("2026-10-01"), d("2026-10-03"));
    expect(
      DateRange.equals(
        range,
        DateRange.create(d("2026-10-01"), d("2026-10-03")),
      ),
    ).toBe(true);
    expect(
      DateRange.equals(
        range,
        DateRange.create(d("2026-10-01"), d("2026-10-04")),
      ),
    ).toBe(false);
  });
});
