import type { LocalDate } from "@repo/core/domain/common/localDate";
import { describe, expect, it } from "vitest";
import {
  jpDate,
  jpDateWithWeekday,
  listingStateText,
  type Offering,
  offeringPhaseLabel,
  offeringStatusText,
  offeringSummary,
} from "../listingView";

const day = (value: string) => value as LocalDate;

const period = (start: string | null, end: string | null): Offering =>
  ({
    kind: "period",
    period: {
      start: start === null ? null : day(start),
      end: end === null ? null : day(end),
    },
  }) as Offering;

describe("jpDate", () => {
  it("words a day as 月日", () => {
    expect(jpDate("2026-10-31")).toBe("10月31日");
    expect(jpDateWithWeekday("2026-10-17")).toBe("10月17日（土）");
  });
});

describe("offeringSummary", () => {
  it("words each kind of offering", () => {
    expect(offeringSummary({ kind: "none" })).toBe("提供の設定なし");
    expect(offeringSummary(period("2026-09-01", "2026-10-31"))).toBe(
      "9月1日〜10月31日",
    );
    expect(offeringSummary(period("2026-11-01", null))).toBe("11月1日から");
    expect(offeringSummary(period(null, "2026-10-31"))).toBe("10月31日まで");
    expect(
      offeringSummary({
        kind: "dates",
        dates: [day("2026-10-17"), day("2026-10-24")],
      }),
    ).toBe("開催日 10月17日ほか1日");
  });
});

describe("offeringStatusText and offeringPhaseLabel", () => {
  it("tells a manual end from a schedule end", () => {
    const offering = period(null, "2026-09-20");
    expect(offeringPhaseLabel({ phase: "ended", cause: "schedule" })).toBe(
      "提供終了（自動）",
    );
    expect(
      offeringPhaseLabel({
        phase: "ended",
        cause: "manual",
        scheduleElapsed: false,
      }),
    ).toBe("提供終了（店舗管理者による）");
    expect(
      offeringStatusText(offering, { phase: "ended", cause: "schedule" }),
    ).toBe("終了日（9月20日）を過ぎたため、提供終了になりました。");
    expect(
      offeringStatusText(offering, {
        phase: "ended",
        cause: "manual",
        scheduleElapsed: true,
      }),
    ).toBe("店舗管理者が提供を終了しました。終了日（9月20日）を過ぎています。");
  });

  it("says when an upcoming offering starts and when an available one ends", () => {
    expect(
      offeringStatusText(period("2026-11-01", null), {
        phase: "upcoming",
        startsOn: day("2026-11-01"),
      }),
    ).toBe("11月1日から提供します。");
    expect(
      offeringStatusText(period(null, "2026-10-31"), { phase: "available" }),
    ).toBe("10月31日まで提供します。");
  });
});

describe("listingStateText", () => {
  it("puts the operator's suspension before the publication and offering", () => {
    expect(
      listingStateText({ status: "published", reason: null }, true, {
        phase: "available",
      }),
    ).toBe("運営による非公開 · 公開中 · 提供中");
    expect(
      listingStateText({ status: "draft", reason: null }, false, {
        phase: "upcoming",
        startsOn: day("2026-11-01"),
      }),
    ).toBe("下書き · 提供開始前");
  });
});
