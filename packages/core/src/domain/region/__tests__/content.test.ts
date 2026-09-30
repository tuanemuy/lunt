import { GeoPoint } from "@repo/core/domain/common/geo";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { isPublishConditionUnmetError } from "@repo/core/domain/common/publication";
import {
  SampleAddress,
  samplePhotoId,
} from "@repo/core/domain/common/testing/samples";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  catchError,
  expectBusinessError,
} from "../../common/__tests__/expectBusinessError";
import { LINE_BREAK_CASES } from "../../common/__tests__/lineBreakCases";
import { RegionContent, type RegionContentInput } from "../content";
import { RegionDescription, RegionName } from "../values";

const input = (over: Partial<RegionContentInput> = {}): RegionContentInput => ({
  name: "谷中",
  address: SampleAddress.otemachi(),
  location: GeoPoint.create(35.72, 139.76),
  photoIds: [samplePhotoId(1)],
  description: "下町",
  tagline: "路地を歩く",
  ...over,
});

describe("RegionName (trimmed, 1–100 characters, one line)", () => {
  it("trims and accepts 1 and 100 characters", () => {
    expect(RegionName.create("  谷中 ")).toBe("谷中");
    expect(RegionName.create("a")).toBe("a");
    expect(RegionName.create("あ".repeat(100))).toBe("あ".repeat(100));
  });

  it("rejects blank, 101 characters and line breaks", () => {
    for (const bad of ["", " 　", "あ".repeat(101), "谷\n中", "谷\r中"]) {
      expectBusinessError(() => RegionName.create(bad), "REGION_INVALID_NAME");
    }
  });

  it("counts code points (100 emoji are fine)", () => {
    expect(RegionName.create("😀".repeat(100))).toHaveLength(200);
  });

  it.each(LINE_BREAK_CASES)("rejects a name with %s inside", (_label, c) => {
    expectBusinessError(
      () => RegionName.create(`谷${c}中`),
      "REGION_INVALID_NAME",
    );
  });

  it("length boundary holds for arbitrary padded text", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 130 }),
        fc.constantFrom("", " ", "　"),
        (n, pad) => {
          const raw = `${pad}${"x".repeat(n)}${pad}`;
          if (n <= 100) expect(RegionName.create(raw)).toBe("x".repeat(n));
          else
            expectBusinessError(
              () => RegionName.create(raw),
              "REGION_INVALID_NAME",
            );
        },
      ),
    );
  });
});

describe("RegionDescription (trimmed, 1–2000 characters)", () => {
  it("accepts line breaks and 2000 characters", () => {
    expect(RegionDescription.create(" 一行目\n二行目 ")).toBe("一行目\n二行目");
    expect(RegionDescription.create("あ".repeat(2000))).toHaveLength(2000);
  });

  it.each(LINE_BREAK_CASES)("accepts %s inside", (_label, c) => {
    expect(RegionDescription.create(`下町${c}路地`)).toBe(`下町${c}路地`);
  });

  it("rejects blank and 2001 characters", () => {
    for (const bad of ["", "  \n ", "あ".repeat(2001)]) {
      expectBusinessError(
        () => RegionDescription.create(bad),
        "REGION_INVALID_DESCRIPTION",
      );
    }
  });

  it("length boundary holds around 2000 code points", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1990, max: 2010 }), (n) => {
        const raw = "😀".repeat(n);
        if (n <= 2000) expect(RegionDescription.create(raw)).toBe(raw);
        else
          expectBusinessError(
            () => RegionDescription.create(raw),
            "REGION_INVALID_DESCRIPTION",
          );
      }),
    );
  });
});

describe("RegionContent.create", () => {
  it("builds every field; blank text is not entered (null)", () => {
    const content = RegionContent.create(
      input({ name: "  ", description: " ", tagline: "" }),
    );
    expect(content.name).toBeNull();
    expect(content.description).toBeNull();
    expect(content.tagline).toBeNull();
    expect(content.photos.takenDown).toBe(false);
    expect(PhotoSet.photoIds(content.photos)).toEqual([samplePhotoId(1)]);
  });

  it("rejects a repeated photo, an invalid tagline, name and description", () => {
    expectBusinessError(
      () =>
        RegionContent.create(
          input({ photoIds: [samplePhotoId(1), samplePhotoId(1)] }),
        ),
      "REGION_DUPLICATE_PHOTO",
    );
    expectBusinessError(
      () => RegionContent.create(input({ tagline: "あ".repeat(61) })),
      "COMMON_INVALID_TAGLINE",
    );
    expectBusinessError(
      () => RegionContent.create(input({ name: "a\nb" })),
      "REGION_INVALID_NAME",
    );
    expectBusinessError(
      () => RegionContent.create(input({ description: "あ".repeat(2001) })),
      "REGION_INVALID_DESCRIPTION",
    );
  });
});

describe("RegionContent.missingRequirements / toPublishable", () => {
  it("lists name, address, location, photos in that order", () => {
    expect(
      RegionContent.missingRequirements(
        RegionContent.create(
          input({ name: null, address: null, location: null, photoIds: [] }),
        ),
      ),
    ).toEqual(["name", "address", "location", "photos"]);
    expect(
      RegionContent.missingRequirements(
        RegionContent.create(input({ location: null, photoIds: [] })),
      ),
    ).toEqual(["location", "photos"]);
  });

  it("is empty for complete content; description and tagline are optional", () => {
    const content = RegionContent.create(
      input({ description: null, tagline: null }),
    );
    expect(RegionContent.missingRequirements(content)).toEqual([]);
    expect(RegionContent.isPublishable(content)).toBe(true);
    expect(RegionContent.toPublishable(content)).toBe(content);
  });

  it("toPublishable throws REGION_PUBLISH_CONDITION_UNMET with the missing ones", () => {
    const error = catchError(() =>
      RegionContent.toPublishable(
        RegionContent.create(input({ address: null, photoIds: [] })),
      ),
    );
    expect(isPublishConditionUnmetError(error)).toBe(true);
    expect(error).toMatchObject({
      code: "REGION_PUBLISH_CONDITION_UNMET",
      missing: ["address", "photos"],
    });
  });
});

describe("RegionContent.equals", () => {
  it("is true for the same input", () => {
    expect(
      RegionContent.equals(
        RegionContent.create(input()),
        RegionContent.create(input()),
      ),
    ).toBe(true);
  });

  it("tells apart every field, the photo order and takenDown", () => {
    const base = RegionContent.create(
      input({ photoIds: [samplePhotoId(1), samplePhotoId(2)] }),
    );
    const variants: RegionContentInput[] = [
      input({ photoIds: [samplePhotoId(2), samplePhotoId(1)] }),
      input({ photoIds: [samplePhotoId(1)] }),
      input({ photoIds: [samplePhotoId(1), samplePhotoId(2)], name: "根津" }),
      input({
        photoIds: [samplePhotoId(1), samplePhotoId(2)],
        address: SampleAddress.ginza(),
      }),
      input({ photoIds: [samplePhotoId(1), samplePhotoId(2)], address: null }),
      input({
        photoIds: [samplePhotoId(1), samplePhotoId(2)],
        location: GeoPoint.create(35.0, 139.0),
      }),
      input({ photoIds: [samplePhotoId(1), samplePhotoId(2)], location: null }),
      input({
        photoIds: [samplePhotoId(1), samplePhotoId(2)],
        description: null,
      }),
      input({ photoIds: [samplePhotoId(1), samplePhotoId(2)], tagline: "別" }),
    ];
    for (const variant of variants) {
      expect(RegionContent.equals(base, RegionContent.create(variant))).toBe(
        false,
      );
    }
    const takenDown = {
      ...base,
      photos: PhotoSet.reconstruct(base.photos.items, true, "REGION"),
    };
    expect(RegionContent.equals(base, takenDown)).toBe(false);
  });
});
