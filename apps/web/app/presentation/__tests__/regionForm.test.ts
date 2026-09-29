import { describe, expect, it } from "vitest";
import type { ErrorState } from "../errorState";
import {
  EMPTY_REGION_FORM,
  regionFieldErrors,
  toRegionContent,
} from "../regionForm";
import { regionStateText } from "../regionView";

const town = {
  areaCode: "2310023",
  prefectureCode: "14",
  prefectureName: "神奈川県",
  municipalityCode: "14104",
  municipalityName: "横浜市中区",
  name: "山下町",
  label: "231-0023 神奈川県横浜市中区山下町",
};

describe("toRegionContent", () => {
  it("sends an empty draft with every field empty", () => {
    const built = toRegionContent(EMPTY_REGION_FORM);
    expect(built).toEqual({
      ok: true,
      content: {
        name: null,
        tagline: null,
        description: null,
        photoIds: [],
        address: null,
        location: null,
      },
    });
  });

  it("refuses a position with one coordinate, and a street part without its town", () => {
    const built = toRegionContent({
      ...EMPTY_REGION_FORM,
      latitude: "35.4",
      addressRest: "1-2-3",
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(Object.keys(built.errors).sort()).toEqual(["location", "town"]);
  });

  it("sends the town, the rest and the position", () => {
    const built = toRegionContent({
      ...EMPTY_REGION_FORM,
      name: "みなと商店街",
      town,
      addressRest: "201-1",
      latitude: "35.4437",
      longitude: "139.649",
    });
    expect(built.ok && built.content).toMatchObject({
      name: "みなと商店街",
      address: {
        town: {
          areaCode: "2310023",
          municipalityCode: "14104",
          name: "山下町",
        },
        rest: "201-1",
      },
      location: { latitude: 35.4437, longitude: 139.649 },
    });
  });
});

describe("regionFieldErrors", () => {
  it("points each unmet publish requirement at its field", () => {
    const error: ErrorState = {
      kind: "invalidInput",
      code: "REGION_PUBLISH_CONDITION_UNMET",
      message: "公開の条件を満たしていません",
      fieldErrors: {},
      missing: ["address", "photos"],
    };
    expect(Object.keys(regionFieldErrors(error)).sort()).toEqual([
      "photos",
      "town",
    ]);
  });
});

describe("regionStateText", () => {
  it("lays 運営による非公開 over the publication", () => {
    expect(
      regionStateText({
        publication: { status: "published", reason: null },
        suspended: true,
      }),
    ).toBe("公開 · 運営による非公開");
    expect(
      regionStateText({
        publication: { status: "unpublished", reason: "byManager" },
        suspended: false,
      }),
    ).toBe("公開の取り下げ");
  });
});
