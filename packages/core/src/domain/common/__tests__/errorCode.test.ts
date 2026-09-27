import { SubjectErrorCode } from "@repo/core/domain/common/errorCode";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import { describe, expect, expectTypeOf, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

describe("SubjectErrorCode ({SUBJECT}_… codes)", () => {
  it("builds each code from the subject prefix", () => {
    expect(SubjectErrorCode.suspended("LISTING")).toBe("LISTING_SUSPENDED");
    expect(SubjectErrorCode.publishConditionUnmet("REGION")).toBe(
      "REGION_PUBLISH_CONDITION_UNMET",
    );
    expect(SubjectErrorCode.alreadySuspended("PLACE")).toBe(
      "PLACE_ALREADY_SUSPENDED",
    );
    expect(SubjectErrorCode.notSuspended("OCCASION")).toBe(
      "OCCASION_NOT_SUSPENDED",
    );
    expect(SubjectErrorCode.duplicatePhoto("ARTICLE")).toBe(
      "ARTICLE_DUPLICATE_PHOTO",
    );
    expect(SubjectErrorCode.photoNotFound("LISTING")).toBe(
      "LISTING_PHOTO_NOT_FOUND",
    );
  });

  it("keeps the literal type", () => {
    expectTypeOf(
      SubjectErrorCode.suspended("PLACE"),
    ).toEqualTypeOf<"PLACE_SUSPENDED">();
    expectTypeOf<SubjectErrorCode<"ARTICLE">>().toEqualTypeOf<
      | "ARTICLE_SUSPENDED"
      | "ARTICLE_PUBLISH_CONDITION_UNMET"
      | "ARTICLE_ALREADY_SUSPENDED"
      | "ARTICLE_NOT_SUSPENDED"
      | "ARTICLE_DUPLICATE_PHOTO"
      | "ARTICLE_PHOTO_NOT_FOUND"
    >();
  });
});

describe("IdBatch (lookups by id take 0–100 inputs)", () => {
  it("accepts 0 and 100", () => {
    expect(() => IdBatch.assertWithinLimit([])).not.toThrow();
    expect(() =>
      IdBatch.assertWithinLimit(Array.from({ length: 100 }, (_, i) => i)),
    ).not.toThrow();
  });

  it("101 is COMMON_INVALID_INPUT", () => {
    expectBusinessError(
      () => IdBatch.assertWithinLimit(Array.from({ length: 101 }, (_, i) => i)),
      "COMMON_INVALID_INPUT",
    );
  });
});
