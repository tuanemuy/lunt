import { describe, expect, it } from "vitest";
import { expectBusinessError } from "../../common/__tests__/expectBusinessError";
import { LINE_BREAK_CASES } from "../../common/__tests__/lineBreakCases";
import { CategoryName, ListingDescription, ListingName } from "../values";

describe("ListingName (trimmed, non-empty, one line)", () => {
  it("trims and refuses blank", () => {
    expect(ListingName.create("  りんご飴 ")).toBe("りんご飴");
    expectBusinessError(
      () => ListingName.create(" 　"),
      "LISTING_INVALID_NAME",
    );
  });

  it.each(LINE_BREAK_CASES)("refuses a name with %s inside", (_label, c) => {
    expectBusinessError(
      () => ListingName.create(`りんご${c}飴`),
      "LISTING_INVALID_NAME",
    );
  });
});

describe("ListingDescription (trimmed, non-empty, may span lines)", () => {
  it.each(LINE_BREAK_CASES)("accepts %s inside", (_label, c) => {
    expect(ListingDescription.create(`甘い${c}赤い`)).toBe(`甘い${c}赤い`);
  });
});

describe("CategoryName (trimmed, non-empty, one line)", () => {
  it("trims and refuses blank", () => {
    expect(CategoryName.create(" 食べる ")).toBe("食べる");
    expectBusinessError(
      () => CategoryName.create(""),
      "LISTING_INVALID_CATEGORY_NAME",
    );
  });

  it.each(LINE_BREAK_CASES)("refuses a name with %s inside", (_label, c) => {
    expectBusinessError(
      () => CategoryName.create(`食べ${c}る`),
      "LISTING_INVALID_CATEGORY_NAME",
    );
  });
});
