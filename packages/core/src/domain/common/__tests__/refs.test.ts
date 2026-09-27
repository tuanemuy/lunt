import { PlaceId } from "@repo/core/domain/common/ids";
import {
  BookmarkRef,
  ContentRef,
  PhotoOwnerRef,
  ShowcaseRef,
  StewardedRef,
} from "@repo/core/domain/common/refs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

describe("references", () => {
  it("ShowcaseRef is listing/place/region/occasion; BookmarkRef listing/place; StewardedRef place/region/occasion", () => {
    expect(ShowcaseRef.kinds).toEqual([
      "listing",
      "place",
      "region",
      "occasion",
    ]);
    expect(BookmarkRef.kinds).toEqual(["listing", "place"]);
    expect(StewardedRef.kinds).toEqual(["place", "region", "occasion"]);
    expect(PhotoOwnerRef.kinds).toEqual([
      "listing",
      "place",
      "region",
      "occasion",
      "article",
      "application",
    ]);
    expectTypeOf<ShowcaseRef["kind"]>().toEqualTypeOf<
      "listing" | "place" | "region" | "occasion"
    >();
    expectTypeOf<BookmarkRef["kind"]>().toEqualTypeOf<"listing" | "place">();
    expectTypeOf<StewardedRef["kind"]>().toEqualTypeOf<
      "place" | "region" | "occasion"
    >();
    expectTypeOf<PhotoOwnerRef["kind"]>().toEqualTypeOf<
      "listing" | "place" | "region" | "occasion" | "article" | "application"
    >();
  });

  it("create pairs the kind with the matching id brand and validates the id", () => {
    const ref = ContentRef.create("place", "p1");
    expect(ref).toEqual({ kind: "place", id: "p1" });
    expectBusinessError(
      () => ContentRef.create("region", ""),
      "COMMON_INVALID_REGION_ID",
    );
    expectBusinessError(
      () => PhotoOwnerRef.create("application", " "),
      "COMMON_INVALID_APPLICATION_ID",
    );
    expect(PhotoOwnerRef.create("application", "a1")).toEqual({
      kind: "application",
      id: "a1",
    });
  });

  it("narrowing guards follow the kind subsets", () => {
    const article = ContentRef.create("article", "x");
    const place = ContentRef.create("place", "x");
    expect(ShowcaseRef.is(article)).toBe(false);
    expect(ShowcaseRef.is(place)).toBe(true);
    expect(BookmarkRef.is(ContentRef.create("region", "x"))).toBe(false);
    expect(StewardedRef.is(ContentRef.create("listing", "x"))).toBe(false);
    expect(StewardedRef.isKind("occasion")).toBe(true);
    expect(ContentRef.isKind("application")).toBe(false);
    expect(PhotoOwnerRef.isKind("application")).toBe(true);
  });

  it("key / equals distinguish kinds sharing an id string", () => {
    const place = { kind: "place", id: PlaceId.create("same") } as const;
    const region = ContentRef.create("region", "same");
    expect(ContentRef.key(place)).toBe("place:same");
    expect(ContentRef.key(place)).not.toBe(ContentRef.key(region));
    expect(ContentRef.equals(place, region)).toBe(false);
    expect(ContentRef.equals(place, ContentRef.create("place", "same"))).toBe(
      true,
    );
  });
});
