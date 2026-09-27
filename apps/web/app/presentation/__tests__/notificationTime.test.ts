import { describe, expect, it } from "vitest";
import { formatNotificationTime } from "../notificationTime";

// 2026-09-28 13:30 in Japan.
const NOW = new Date("2026-09-28T04:30:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe("formatNotificationTime", () => {
  it("says just now under a minute", () => {
    expect(formatNotificationTime(ago(30 * 1000), NOW)).toBe("たった今");
  });

  it("counts minutes under an hour", () => {
    expect(formatNotificationTime(ago(59 * MINUTE), NOW)).toBe("59分前");
  });

  it("counts hours the same day in Japan", () => {
    expect(formatNotificationTime(ago(2 * HOUR), NOW)).toBe("2時間前");
    expect(formatNotificationTime(ago(13 * HOUR), NOW)).toBe("13時間前");
  });

  it("says yesterday with the time for the previous day in Japan", () => {
    // 2026-09-27 23:59 JST.
    expect(
      formatNotificationTime(new Date("2026-09-27T14:59:00.000Z"), NOW),
    ).toBe("昨日 23:59");
  });

  it("gives the month and day earlier this year, and the year before", () => {
    expect(
      formatNotificationTime(new Date("2026-09-24T01:00:00.000Z"), NOW),
    ).toBe("9月24日");
    expect(
      formatNotificationTime(new Date("2025-12-31T16:00:00.000Z"), NOW),
    ).toBe("1月1日");
    expect(
      formatNotificationTime(new Date("2025-12-31T14:00:00.000Z"), NOW),
    ).toBe("2025年12月31日");
  });
});
