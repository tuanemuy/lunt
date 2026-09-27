import { describe, expect, it } from "vitest";
import type { ErrorState } from "../errorState";
import { controlsOf, framingOf } from "../framing";
import {
  EMPTY_LISTING_FORM,
  listingFieldErrors,
  toListingContent,
} from "../listingForm";
import { placeFieldErrors, toPlaceProfile } from "../placeForm";
import type { TownOption } from "../placeView";
import { placeStateText } from "../placeView";

const town: TownOption = {
  areaCode: "1000005",
  prefectureCode: "13",
  prefectureName: "東京都",
  municipalityCode: "13101",
  municipalityName: "千代田区",
  name: "丸の内",
  label: "100-0005 東京都千代田区丸の内",
};

const placeValues = {
  photos: [{ photoId: "p1", url: "/photos/p1" }],
  name: "喫茶 日々",
  town,
  addressRest: "1-2-3",
  latitude: "35.68",
  longitude: "139.76",
  businessHours: "",
  description: "  ",
  contact: "012-345-6789",
};

const invalid = (
  change: Partial<Extract<ErrorState, { kind: "invalidInput" }>>,
): ErrorState => ({
  kind: "invalidInput",
  code: null,
  message: "入力内容を確かめてください",
  fieldErrors: {},
  missing: [],
  ...change,
});

describe("toPlaceProfile", () => {
  it("builds the transport profile, blanks as not entered", () => {
    const built = toPlaceProfile(placeValues);
    expect(built).toEqual({
      ok: true,
      profile: {
        name: "喫茶 日々",
        photoIds: ["p1"],
        description: null,
        town: {
          areaCode: "1000005",
          municipalityCode: "13101",
          name: "丸の内",
        },
        addressRest: "1-2-3",
        location: { latitude: 35.68, longitude: 139.76 },
        businessHours: null,
        contact: "012-345-6789",
      },
    });
  });

  it("refuses without a town or with a position that is not numbers", () => {
    const built = toPlaceProfile({ ...placeValues, town: null, latitude: "x" });
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(Object.keys(built.errors).sort()).toEqual(["location", "town"]);
    }
  });
});

describe("placeFieldErrors", () => {
  it("maps transport paths and business codes onto fields", () => {
    expect(
      placeFieldErrors(
        invalid({
          fieldErrors: { "profile.location.latitude": ["緯度は-90〜90"] },
        }),
      ),
    ).toEqual({ location: "緯度は-90〜90" });
    expect(
      placeFieldErrors(
        invalid({
          code: "PLACE_INVALID_NAME",
          message: "名称を入力してください",
        }),
      ),
    ).toEqual({ name: "名称を入力してください" });
  });
});

describe("toListingContent", () => {
  it("sends blanks as not entered and keeps the framing", () => {
    expect(
      toListingContent({
        ...EMPTY_LISTING_FORM,
        name: "いちじくのパフェ",
        photos: [
          {
            photoId: "p1",
            url: null,
            framing: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
          },
        ],
        offering: { kind: "period", start: "", end: "2026-10-31" },
      }),
    ).toEqual({
      name: "いちじくのパフェ",
      description: null,
      categoryId: null,
      photos: [
        { photoId: "p1", framing: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } },
      ],
      offering: { kind: "period", start: null, end: "2026-10-31" },
    });
  });
});

describe("listingFieldErrors", () => {
  it("points an unmet publish condition at its fields", () => {
    expect(
      listingFieldErrors(
        invalid({
          code: "LISTING_PUBLISH_CONDITION_UNMET",
          missing: ["photos", "category"],
        }),
      ),
    ).toEqual({
      photos: "写真を1枚以上登録してください",
      category: "カテゴリーを選んでください",
    });
  });

  it("points an invalid offering at the offering", () => {
    expect(
      listingFieldErrors(
        invalid({ code: "LISTING_INVALID_OFFERING_PERIOD", message: "期間" }),
      ),
    ).toEqual({ offering: "期間" });
  });
});

describe("framing controls", () => {
  it("shows the whole photo at zoom 1", () => {
    expect(framingOf({ zoom: 1, centerX: 0.3, centerY: 0.3 })).toBeNull();
  });

  it("keeps the frame inside the photo", () => {
    expect(framingOf({ zoom: 2, centerX: 0.9, centerY: 0.1 })).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
  });

  it("starts the editor from a stored framing", () => {
    expect(controlsOf({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 })).toEqual({
      zoom: 2,
      centerX: 0.5,
      centerY: 0.5,
    });
  });
});

describe("placeStateText", () => {
  it("words the operating status and the suspension", () => {
    expect(
      placeStateText({ operatingStatus: "temporarilyClosed", suspended: true }),
    ).toBe("休業 · 店舗は非公開");
  });
});
