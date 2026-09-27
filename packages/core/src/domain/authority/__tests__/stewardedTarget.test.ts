import { OccasionId, PlaceId, RegionId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import { StewardedTargetOrder } from "../stewardedTarget";

describe("StewardedTargetOrder", () => {
  it("orders place, region, occasion, then id by code point", () => {
    const refs: StewardedRef[] = [
      { kind: "occasion", id: OccasionId.create("a") },
      { kind: "region", id: RegionId.create("b") },
      { kind: "place", id: PlaceId.create("b") },
      { kind: "place", id: PlaceId.create("a") },
      { kind: "region", id: RegionId.create("a") },
    ];
    expect(
      [...refs]
        .sort(StewardedTargetOrder.compare)
        .map((ref) => `${ref.kind}:${ref.id}`),
    ).toEqual(["place:a", "place:b", "region:a", "region:b", "occasion:a"]);
  });

  it("compares ids by code point, not by UTF-16 unit or locale", () => {
    // U+1F600 (a surrogate pair) is above U+FF5E by code point, below it by
    // UTF-16 code unit.
    const high: StewardedRef = { kind: "place", id: PlaceId.create("😀") };
    const low: StewardedRef = { kind: "place", id: PlaceId.create("～") };
    const upper: StewardedRef = { kind: "place", id: PlaceId.create("B") };
    const lower: StewardedRef = { kind: "place", id: PlaceId.create("a") };
    expect(StewardedTargetOrder.compare(low, high)).toBeLessThan(0);
    expect(StewardedTargetOrder.compare(upper, lower)).toBeLessThan(0);
    expect(StewardedTargetOrder.compare(lower, lower)).toBe(0);
  });
});
