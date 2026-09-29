import { describe, expect, it } from "vitest";
import {
  claimErrors,
  claimFieldErrors,
  listingChangedFields,
  listingMissing,
  offeringDraftText,
  offeringInputError,
  placeChangedFields,
  replyOf,
} from "../applyForm";
import type { PlaceStateValues } from "../applyView";
import type { ErrorState } from "../errorState";
import { EMPTY_LISTING_FORM, type ListingFormValues } from "../listingForm";

const town = {
  areaCode: "1100001",
  prefectureCode: "13",
  prefectureName: "東京都",
  municipalityCode: "13106",
  municipalityName: "台東区",
  name: "谷中",
  label: "110-0001 東京都台東区谷中",
};

const place: PlaceStateValues = {
  values: {
    photos: [{ photoId: "p1", url: "/photos/p1" }],
    name: "谷中ベーカリー",
    town,
    addressRest: "3-3-3",
    latitude: "35.7256",
    longitude: "139.7663",
    businessHours: "7:00〜18:00",
    description: "",
    contact: "",
  },
  operatingStatus: "open",
};

describe("placeChangedFields", () => {
  it("finds nothing when only blanks around the text differ", () => {
    const next = {
      ...place,
      values: {
        ...place.values,
        name: " 谷中ベーカリー ",
        latitude: "35.72560",
      },
    };
    expect(placeChangedFields(place, next)).toEqual([]);
  });

  it("lists the changed items in screen order, the operating status last", () => {
    const next: PlaceStateValues = {
      values: { ...place.values, businessHours: "7:00〜17:00", photos: [] },
      operatingStatus: "temporarilyClosed",
    };
    expect(placeChangedFields(place, next)).toEqual([
      "photos",
      "businessHours",
      "operatingStatus",
    ]);
  });
});

describe("listing forms", () => {
  const listing: ListingFormValues = {
    photos: [{ photoId: "p1", url: null, framing: null }],
    name: "くるみパン",
    categoryId: "c1",
    description: "",
    offering: { kind: "none" },
  };

  it("names the publish condition's missing items", () => {
    expect(Object.keys(listingMissing(EMPTY_LISTING_FORM))).toEqual([
      "photos",
      "name",
      "category",
    ]);
    expect(listingMissing(listing)).toEqual({});
  });

  it("refuses before the review the offerings the submission refuses", () => {
    const code = (offering: ListingFormValues["offering"]) =>
      offeringInputError(offering)?.code ?? null;
    expect(
      code({ kind: "period", start: "2026-10-10", end: "2026-10-09" }),
    ).toBe("LISTING_INVALID_OFFERING_PERIOD");
    expect(code({ kind: "period", start: "", end: "" })).toBe(
      "LISTING_INVALID_OFFERING_PERIOD",
    );
    expect(code({ kind: "dates", dates: [] })).toBe(
      "LISTING_INVALID_OPEN_DATES",
    );
    expect(
      code({ kind: "period", start: "2026-10-10", end: "2026-10-10" }),
    ).toBeNull();
    expect(code({ kind: "period", start: "", end: "2026-10-10" })).toBeNull();
    expect(code({ kind: "period", start: "2026-10-10", end: "" })).toBeNull();
    expect(code({ kind: "dates", dates: ["2026-10-10"] })).toBeNull();
    expect(code({ kind: "none" })).toBeNull();
    expect(
      offeringInputError({
        kind: "period",
        start: "2026-10-10",
        end: "2026-10-09",
      })?.message,
    ).toBe("提供期間は開始日か終了日を入れ、終了日は開始日以降にしてください");
  });

  it("counts a new framing as a change of the photos", () => {
    const next: ListingFormValues = {
      ...listing,
      photos: [
        {
          photoId: "p1",
          url: null,
          framing: { x: 0, y: 0, width: 0.5, height: 0.5 },
        },
      ],
      offering: { kind: "dates", dates: ["2026-10-10"] },
    };
    expect(listingChangedFields(listing, next)).toEqual(["photos", "offering"]);
  });

  it("words the offering", () => {
    expect(offeringDraftText({ kind: "none" })).toBe("設定しない");
    expect(
      offeringDraftText({ kind: "period", start: "2026-10-01", end: "" }),
    ).toBe("提供期間 · 10月1日〜");
  });
});

describe("claims and replies", () => {
  it("needs both texts", () => {
    expect(claimErrors({ relationship: " ", evidence: "電話" })).toEqual({
      relationship: "店舗との関係を書いてください",
    });
  });

  it("points the claim's business error at the blank fields", () => {
    const error: ErrorState = {
      kind: "invalidInput",
      code: "APPLICATION_INVALID_STEWARDSHIP_CLAIM",
      message: "入力してください",
      fieldErrors: { "stewardship.evidence": ["長すぎます"] },
      missing: [],
    };
    expect(
      claimFieldErrors(error, { relationship: "", evidence: "x" }),
    ).toEqual({
      relationship: "店舗との関係を書いてください",
      evidence: "長すぎます",
    });
  });

  it("sends an empty reply as none and a spaces-only reply as it is", () => {
    expect(replyOf("")).toBeNull();
    expect(replyOf("  ")).toBe("  ");
    expect(replyOf("回答")).toBe("回答");
  });
});
