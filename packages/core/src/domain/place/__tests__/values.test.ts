import { describe, expect, it } from "vitest";
import { expectBusinessError } from "../../common/__tests__/expectBusinessError";
import { LINE_BREAK_CASES } from "../../common/__tests__/lineBreakCases";
import { OperatingStatus } from "../operatingStatus";
import {
  BusinessHours,
  ContactInfo,
  PlaceDescription,
  PlaceName,
  PlaceProfile,
} from "../profile";
import {
  SampleAddress,
  samplePhotoId,
  sampleProfile,
} from "../testing/samples";

describe("OperatingStatus", () => {
  it("accepts the three statuses", () => {
    for (const status of ["open", "temporarilyClosed", "permanentlyClosed"]) {
      expect(OperatingStatus.create(status)).toBe(status);
    }
  });

  it("rejects anything else", () => {
    expectBusinessError(
      () => OperatingStatus.create("closed"),
      "PLACE_INVALID_OPERATING_STATUS",
    );
  });
});

describe("text values", () => {
  it.each([
    [PlaceName, "PLACE_INVALID_NAME"],
    [PlaceDescription, "PLACE_INVALID_DESCRIPTION"],
    [BusinessHours, "PLACE_INVALID_BUSINESS_HOURS"],
    [ContactInfo, "PLACE_INVALID_CONTACT_INFO"],
  ] as const)("trims and rejects blank input (%#)", (value, code) => {
    expect(value.create("  値  ")).toBe("値");
    expectBusinessError(() => value.create(" 　 "), code);
  });

  it.each(LINE_BREAK_CASES)("rejects a name with %s inside", (_label, c) => {
    expectBusinessError(
      () => PlaceName.create(`山田${c}商店`),
      "PLACE_INVALID_NAME",
    );
  });

  it.each(LINE_BREAK_CASES)("keeps %s inside the other texts", (_label, c) => {
    for (const value of [PlaceDescription, BusinessHours, ContactInfo]) {
      expect(value.create(`一行目${c}二行目`)).toBe(`一行目${c}二行目`);
    }
  });

  it("reads a blank optional text as null", () => {
    expect(PlaceDescription.optional(null)).toBeNull();
    expect(PlaceDescription.optional("   ")).toBeNull();
    expect(PlaceDescription.optional(" 紹介 ")).toBe("紹介");
  });
});

describe("PlaceProfile", () => {
  it("builds every value object; blank optional texts become null", () => {
    const profile = sampleProfile({
      name: "  山田珈琲店 ",
      photoIds: [samplePhotoId(2), samplePhotoId(1)],
      description: "  ",
      businessHours: " 10:00-18:00 ",
      contact: "",
    });
    expect(profile.name).toBe("山田珈琲店");
    expect(profile.photos.items.map((p) => p.photoId)).toEqual([
      samplePhotoId(2),
      samplePhotoId(1),
    ]);
    expect(profile.photos.takenDown).toBe(false);
    expect(profile.description).toBeNull();
    expect(profile.visitInfo).toEqual({
      businessHours: "10:00-18:00",
      contact: null,
    });
    expect(PlaceProfile.cover(profile)).toBe(samplePhotoId(2));
  });

  it("rejects a blank name, a repeated photo and an invalid location", () => {
    expectBusinessError(
      () => sampleProfile({ name: " " }),
      "PLACE_INVALID_NAME",
    );
    expectBusinessError(
      () => sampleProfile({ photoIds: [samplePhotoId(1), samplePhotoId(1)] }),
      "PLACE_DUPLICATE_PHOTO",
    );
    expectBusinessError(
      () => sampleProfile({ location: { latitude: 91, longitude: 0 } }),
      "COMMON_INVALID_GEO_POINT",
    );
  });

  it("compares every field, photos by order", () => {
    const base = sampleProfile({
      photoIds: [samplePhotoId(1), samplePhotoId(2)],
    });
    expect(
      PlaceProfile.equals(
        base,
        sampleProfile({ photoIds: [samplePhotoId(1), samplePhotoId(2)] }),
      ),
    ).toBe(true);
    for (const other of [
      sampleProfile({ photoIds: [samplePhotoId(2), samplePhotoId(1)] }),
      sampleProfile({
        photoIds: [samplePhotoId(1), samplePhotoId(2)],
        name: "別の店",
      }),
      sampleProfile({
        photoIds: [samplePhotoId(1), samplePhotoId(2)],
        address: SampleAddress.ginza(),
      }),
      sampleProfile({
        photoIds: [samplePhotoId(1), samplePhotoId(2)],
        contact: "03-0000-0000",
      }),
      sampleProfile({
        photoIds: [samplePhotoId(1), samplePhotoId(2)],
        location: { latitude: 35, longitude: 139 },
      }),
    ]) {
      expect(PlaceProfile.equals(base, other)).toBe(false);
    }
  });
});
