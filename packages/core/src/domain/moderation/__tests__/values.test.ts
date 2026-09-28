import { PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "../../common/__tests__/expectBusinessError";
import { TakedownOutcome } from "../takedownOutcome";
import { moderationSamples } from "../testing/samples";
import {
  InfoReportCategory,
  InfoReportContent,
  InfoReportTarget,
  TakedownGround,
  TakedownReason,
} from "../values";

describe("bounded texts", () => {
  it.each([
    [TakedownReason, "MODERATION_INVALID_TAKEDOWN_REASON"],
    [TakedownOutcome, "MODERATION_INVALID_TAKEDOWN_OUTCOME"],
    [InfoReportContent, "MODERATION_INVALID_INFO_REPORT_CONTENT"],
  ] as const)(
    "trims, keeps 1-2,000 characters and rejects the rest (%#)",
    (value, code) => {
      expect(value.create("  理由  ")).toBe("理由");
      expect(value.create("あ".repeat(2000))).toHaveLength(2000);
      expect(value.create("😀".repeat(2000))).toHaveLength(4000);
      expectBusinessError(() => value.create(" \n "), code);
      expectBusinessError(() => value.create("あ".repeat(2001)), code);
    },
  );
});

describe("TakedownGround", () => {
  const s = moderationSamples();

  it("accepts a proprietor on a listing or a place, without photos", () => {
    const listing = { kind: "listing", id: s.ids.listing() } as const;
    const place = { kind: "place", id: s.ids.place() } as const;
    expect(TakedownGround.create("proprietor", listing, [])).toEqual({
      standing: "proprietor",
      target: listing,
    });
    expect(TakedownGround.create("proprietor", place, [])).toEqual({
      standing: "proprietor",
      target: place,
    });
  });

  it("rejects a proprietor on a region, occasion or article, or naming a photo", () => {
    for (const target of [
      { kind: "region", id: s.ids.region() },
      { kind: "occasion", id: s.ids.occasion() },
      { kind: "article", id: s.ids.article() },
    ] as const) {
      expectBusinessError(
        () => TakedownGround.create("proprietor", target, []),
        "MODERATION_INVALID_TAKEDOWN_GROUND",
      );
    }
    expectBusinessError(
      () =>
        TakedownGround.create(
          "proprietor",
          { kind: "place", id: s.ids.place() },
          [s.ids.photo()],
        ),
      "MODERATION_INVALID_TAKEDOWN_GROUND",
    );
  });

  it("requires a photo rights holder to name distinct photos, on any content", () => {
    const photo = s.ids.photo();
    const article = { kind: "article", id: s.ids.article() } as const;
    expect(
      TakedownGround.create("photoRightsHolder", article, [photo]),
    ).toEqual({
      standing: "photoRightsHolder",
      target: article,
      photoIds: [photo],
    });
    expectBusinessError(
      () => TakedownGround.create("photoRightsHolder", article, []),
      "MODERATION_INVALID_TAKEDOWN_GROUND",
    );
    expectBusinessError(
      () => TakedownGround.create("photoRightsHolder", article, [photo, photo]),
      "MODERATION_INVALID_TAKEDOWN_GROUND",
    );
  });

  it("rejects an unknown standing", () => {
    expectBusinessError(
      () =>
        TakedownGround.create(
          "owner",
          { kind: "place", id: s.ids.place() },
          [],
        ),
      "MODERATION_INVALID_TAKEDOWN_GROUND",
    );
  });

  it("compares standing, target and the set of photos", () => {
    const [a, b] = [s.ids.photo(), s.ids.photo()];
    const target = { kind: "listing", id: s.ids.listing() } as const;
    const ground = TakedownGround.create("photoRightsHolder", target, [a, b]);
    expect(
      TakedownGround.equals(
        ground,
        TakedownGround.create("photoRightsHolder", target, [b, a]),
      ),
    ).toBe(true);
    expect(
      TakedownGround.equals(
        ground,
        TakedownGround.create("photoRightsHolder", target, [a]),
      ),
    ).toBe(false);
    expect(
      TakedownGround.equals(
        TakedownGround.create("proprietor", target, []),
        TakedownGround.create(
          "proprietor",
          { kind: "place", id: PlaceId.create(target.id) },
          [],
        ),
      ),
    ).toBe(false);
  });
});

describe("InfoReportCategory", () => {
  it("accepts the two categories and rejects anything else", () => {
    expect(InfoReportCategory.create("incorrectInfo")).toBe("incorrectInfo");
    expect(InfoReportCategory.create("closure")).toBe("closure");
    expectBusinessError(
      () => InfoReportCategory.create("spam"),
      "MODERATION_INVALID_INFO_REPORT_CATEGORY",
    );
  });
});

describe("InfoReportTarget", () => {
  const s = moderationSamples();

  it("compares every field and maps to the reported content", () => {
    const placeId = s.ids.place();
    const listingId = s.ids.listing();
    const listing = { kind: "listing", placeId, listingId } as const;
    expect(InfoReportTarget.equals(listing, { ...listing })).toBe(true);
    expect(
      InfoReportTarget.equals(listing, { ...listing, placeId: s.ids.place() }),
    ).toBe(false);
    expect(InfoReportTarget.equals(listing, { kind: "place", placeId })).toBe(
      false,
    );
    expect(InfoReportTarget.contentRef(listing)).toEqual({
      kind: "listing",
      id: listingId,
    });
    expect(InfoReportTarget.contentRef({ kind: "place", placeId })).toEqual({
      kind: "place",
      id: placeId,
    });
  });
});
