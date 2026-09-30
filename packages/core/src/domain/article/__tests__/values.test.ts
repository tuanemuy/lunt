import { describe, expect, it } from "vitest";
import { expectBusinessError } from "../../common/__tests__/expectBusinessError";
import { LINE_BREAK_CASES } from "../../common/__tests__/lineBreakCases";
import { ArticleBody, ArticleTitle } from "../values";

describe("ArticleTitle (trimmed, 1–100 characters, one line)", () => {
  it("trims and accepts 1 and 100 characters", () => {
    expect(ArticleTitle.create(" 路地の話 ")).toBe("路地の話");
    expect(ArticleTitle.create("あ".repeat(100))).toHaveLength(100);
    expectBusinessError(
      () => ArticleTitle.create("あ".repeat(101)),
      "ARTICLE_INVALID_TITLE",
    );
  });

  it.each(LINE_BREAK_CASES)("refuses a title with %s inside", (_label, c) => {
    expectBusinessError(
      () => ArticleTitle.create(`路地の${c}話`),
      "ARTICLE_INVALID_TITLE",
    );
  });
});

describe("ArticleBody (trimmed, 1–20,000 characters, may span lines)", () => {
  it.each(LINE_BREAK_CASES)("accepts %s inside", (_label, c) => {
    expect(ArticleBody.create(`一段落${c}二段落`)).toBe(`一段落${c}二段落`);
  });
});
