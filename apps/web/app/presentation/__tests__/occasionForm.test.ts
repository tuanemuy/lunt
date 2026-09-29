import { describe, expect, it } from "vitest";
import type { ErrorState } from "../errorState";
import {
  EMPTY_OCCASION_FORM,
  occasionFieldErrors,
  toOccasionContent,
} from "../occasionForm";
import { attachedListingState, occasionStateText } from "../occasionView";

describe("toOccasionContent", () => {
  it("sends an empty draft with every field empty", () => {
    const built = toOccasionContent({ ...EMPTY_OCCASION_FORM, name: "市" });
    expect(built).toEqual({
      ok: true,
      content: {
        name: "市",
        period: null,
        address: null,
        location: null,
        photoIds: [],
        description: null,
        tagline: null,
      },
    });
  });

  it("refuses an end before the start and a half-entered period (CS-10)", () => {
    expect(
      toOccasionContent({
        ...EMPTY_OCCASION_FORM,
        start: "2026-10-12",
        end: "2026-10-10",
      }),
    ).toEqual({
      ok: false,
      errors: {
        period:
          "終了日は、開始日（10月12日）と同じ日か、それより後にしてください",
      },
    });
    expect(
      toOccasionContent({ ...EMPTY_OCCASION_FORM, start: "2026-10-12" }),
    ).toMatchObject({ ok: false, errors: { period: expect.any(String) } });
  });

  it("refuses a position that is not two numbers", () => {
    expect(
      toOccasionContent({ ...EMPTY_OCCASION_FORM, latitude: "35.4" }),
    ).toMatchObject({ ok: false, errors: { location: expect.any(String) } });
  });
});

describe("occasionFieldErrors", () => {
  it("points the unmet publish requirements at their fields", () => {
    const error: ErrorState = {
      kind: "invalidInput",
      code: "OCCASION_PUBLISH_CONDITION_UNMET",
      message: "公開に必要な項目が足りません",
      fieldErrors: {},
      missing: ["venue", "photos"],
    };
    expect(Object.keys(occasionFieldErrors(error)).sort()).toEqual([
      "location",
      "photos",
      "town",
    ]);
  });
});

describe("occasion wording", () => {
  it("states publication, suspension and holding status together", () => {
    expect(
      occasionStateText({
        publication: { status: "published", reason: null },
        suspended: true,
        holding: "upcoming",
      }),
    ).toBe("公開 · 運営による非公開 · 開催前");
    expect(
      occasionStateText({
        publication: { status: "unpublished", reason: "byManager" },
        suspended: false,
        holding: "cancelled",
      }),
    ).toBe("公開の取り下げ · 中止");
  });

  it("tells a hidden attached listing apart from a shown one", () => {
    expect(attachedListingState({ id: "l1", deleted: true })).toEqual({
      label: "削除された掲載",
      hidden: true,
    });
    expect(
      attachedListingState({
        id: "l2",
        deleted: false,
        name: "パン",
        photoUrl: null,
        publication: { status: "published", reason: null },
        suspended: false,
        offeringStatus: { phase: "ended", cause: "schedule" },
        viewable: true,
      }),
    ).toEqual({ label: "提供終了", hidden: false });
  });
});
