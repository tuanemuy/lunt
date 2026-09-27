import { LocalDate } from "@repo/core/domain/common/localDate";
import {
  Offering,
  OfferingPeriod,
  OpenDates,
} from "@repo/core/domain/listing/offering";
import { describe, expect, it } from "vitest";
import { formatDay, offeringLabel, offeringText } from "../detailView";
import { invitedOnText } from "../members";

const day = (value: string | null): LocalDate | null =>
  value === null ? null : LocalDate.parse(value);

const period = (start: string | null, end: string | null): Offering => ({
  kind: "period",
  period: OfferingPeriod.create({ start: day(start), end: day(end) }),
});

const dates = (...values: string[]): Offering => ({
  kind: "dates",
  dates: OpenDates.create(values.map(LocalDate.parse)),
});

describe("formatDay", () => {
  it("words a day of this year with its weekday", () => {
    expect(formatDay("2026-10-01", "2026-09-28")).toBe("10月1日（木）");
  });

  it("leads with the year when it is not today's", () => {
    expect(formatDay("2027-01-05", "2026-09-28")).toBe("2027年1月5日（火）");
  });
});

describe("offeringText", () => {
  const today = "2026-09-28";

  it("is null without an offering", () => {
    expect(offeringText(Offering.none(), today)).toBeNull();
  });

  it("words a period, an open start and an open end", () => {
    expect(offeringText(period("2026-10-01", "2026-11-30"), today)).toBe(
      "提供期間　10月1日（木）〜11月30日（月）",
    );
    expect(offeringText(period("2026-10-01", null), today)).toBe(
      "提供期間　10月1日（木）から",
    );
    expect(offeringText(period(null, "2026-11-30"), today)).toBe(
      "提供期間　11月30日（月）まで",
    );
  });

  it("lists every open date", () => {
    expect(offeringText(dates("2026-10-17", "2026-10-18"), today)).toBe(
      "開催日　10月17日（土）、10月18日（日）",
    );
  });
});

describe("offeringLabel", () => {
  it("labels only what is not available", () => {
    expect(offeringLabel({ phase: "available" })).toBeNull();
    expect(
      offeringLabel({ phase: "upcoming", startsOn: "10月1日（木）" }),
    ).toBe("提供開始前・10月1日（木）から");
    expect(offeringLabel({ phase: "ended" })).toBe("提供終了");
  });
});

describe("invitedOnText", () => {
  it("uses the Japan-time calendar day", () => {
    expect(invitedOnText("2026-09-19T15:30:00.000Z")).toBe("9月20日に招待");
  });
});
