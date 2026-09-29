import { describe, expect, it } from "vitest";
import {
  reviewFrom,
  reviewOriginFrame,
  reviewOriginOf,
  reviewSearchSchema,
} from "../reviewOrigin";

const originOf = (from: unknown) =>
  reviewOriginOf(reviewSearchSchema.parse({ from }));

describe("CM-01 ?from=", () => {
  it("round-trips each list CM-01 is opened from", () => {
    for (const origin of [
      { kind: "ops" },
      { kind: "region", id: "01a0ee12-3e31-72c7-a6c1-dccb59637098" },
      { kind: "occasion", id: "01a0ee16-fd17-724f-851b-91e76e0d7bfa" },
    ] as const) {
      expect(originOf(reviewFrom(origin))).toEqual(origin);
    }
  });

  it("drops what it does not recognise", () => {
    expect(originOf(undefined)).toBeNull();
    expect(originOf("place:abc")).toBeNull();
    expect(originOf("region:")).toBeNull();
    expect(originOf("region:a/b")).toBeNull();
    expect(originOf(3)).toBeNull();
  });

  it("frames and leads back by the origin, neutrally without one", () => {
    expect(reviewOriginFrame({ kind: "region", id: "r1" })).toEqual({
      context: "地域の運営",
      back: { to: "/manage/regions/r1", label: "所属店舗と申請へ戻る" },
    });
    expect(reviewOriginFrame({ kind: "occasion", id: "e1" })).toEqual({
      context: "イベントの運営",
      back: { to: "/manage/events/e1", label: "参加店舗と申請へ戻る" },
    });
    expect(reviewOriginFrame({ kind: "ops" }).context).toBe("サービス運営");
    expect(reviewOriginFrame(null)).toEqual({ context: "管理", back: null });
  });
});
