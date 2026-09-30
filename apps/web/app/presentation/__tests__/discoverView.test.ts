import { describe, expect, it } from "vitest";
import { cardSaveState, readFeedSaves } from "@/components/discover/feedSaves";
import {
  closureText,
  FEED_MAX_LISTINGS,
  FEED_MAX_PAGE,
  FEED_PAGE_SIZE,
  isBlankKeyword,
  toFeedPage,
} from "../discoverView";

describe("discoverView", () => {
  it("tells a blank keyword (half- and full-width spaces) from a keyword", () => {
    expect(isBlankKeyword("")).toBe(true);
    expect(isBlankKeyword("   ")).toBe(true);
    expect(isBlankKeyword("　　")).toBe(true);
    expect(isBlankKeyword(" 花 ")).toBe(false);
  });

  it("words a place's closure and nothing while it operates", () => {
    expect(closureText("temporarilyClosed")).toBe("休業中");
    expect(closureText("permanentlyClosed")).toBe("閉店");
    expect(closureText("open")).toBeNull();
  });

  it("pages the feed in multiples of the frame interval up to its depth", () => {
    expect(FEED_PAGE_SIZE % 6).toBe(0);
    expect(FEED_MAX_PAGE * FEED_PAGE_SIZE).toBeLessThanOrEqual(
      FEED_MAX_LISTINGS,
    );
    expect((FEED_MAX_PAGE + 1) * FEED_PAGE_SIZE).toBeGreaterThan(
      FEED_MAX_LISTINGS,
    );
  });

  it("ends the feed at its depth and says so only when more listings match", () => {
    const depth = FEED_MAX_PAGE * FEED_PAGE_SIZE;
    const page = (listingCount: number) =>
      toFeedPage(
        {
          items: [],
          listingCount,
          hasMore: false,
          effective: { areas: [], categoryIds: [] },
          photos: {},
        },
        "2026-09-30",
        new Set(),
      );
    expect(page(depth + 1)).toMatchObject({ count: depth, capped: true });
    expect(page(depth)).toMatchObject({ count: depth, capped: false });
    expect(page(10)).toMatchObject({ count: 10, capped: false });
  });
});

describe("feedSaves", () => {
  it("leaves a card to the device while signed out", () => {
    expect(cardSaveState(false, "l1", true, null)).toEqual({ signedIn: false });
  });

  it("prefers the fresh read over what the card's page said", () => {
    const fresh = { targets: ["listing:l1"], saved: [] };
    expect(cardSaveState(true, "l1", true, fresh)).toEqual({
      signedIn: true,
      saved: [],
    });
    expect(cardSaveState(true, "l2", true, fresh)).toEqual({
      signedIn: true,
      saved: ["listing:l2"],
    });
  });

  it("reads the saves in runs of 100 and gives nothing while signed out", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `l${i}`);
    const runs: number[] = [];
    const fresh = await readFeedSaves(ids, async (targets) => {
      runs.push(targets.length);
      return { signedIn: true, saved: [`listing:${targets[0]?.id}`] };
    });
    expect(runs).toEqual([100, 50]);
    expect(fresh?.targets).toHaveLength(150);
    expect(fresh?.saved).toEqual(["listing:l0", "listing:l100"]);
    expect(
      await readFeedSaves(ids, async () => ({ signedIn: false })),
    ).toBeNull();
    expect(
      await readFeedSaves([], async () => ({ signedIn: false })),
    ).toBeNull();
  });
});
