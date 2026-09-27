import {
  KeywordRelevance,
  type SearchableText,
  SearchKeyword,
} from "@repo/core/domain/common/searchKeyword";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

const CODE = "COMMON_INVALID_SEARCH_KEYWORD";

describe("SearchKeyword.parse", () => {
  it("step 1: over 100 characters after trimming is COMMON_INVALID_SEARCH_KEYWORD", () => {
    expectBusinessError(() => SearchKeyword.parse("a".repeat(101)), CODE);
    expect(SearchKeyword.parse("a".repeat(100))?.terms).toEqual([
      "a".repeat(100),
    ]);
    expect(SearchKeyword.parse(`  ${"a".repeat(100)}　`)?.terms).toEqual([
      "a".repeat(100),
    ]);
  });

  it("step 1 counts characters (code points)", () => {
    expect(SearchKeyword.parse("😀".repeat(100))).not.toBeNull();
    expectBusinessError(() => SearchKeyword.parse("😀".repeat(101)), CODE);
  });

  it("step 1 counts the whitespace between words (101 characters fails)", () => {
    expectBusinessError(() => SearchKeyword.parse(`a${" ".repeat(99)}b`), CODE);
  });

  it("step 2: splits on whitespace, full-width space included", () => {
    expect(SearchKeyword.parse("カフェ　山田 本店")?.terms).toEqual([
      "カフェ",
      "山田",
      "本店",
    ]);
  });

  it("step 3: normalises each term (NFKC, lowercase)", () => {
    expect(SearchKeyword.parse("ＣＡＦＥ Lunt")?.terms).toEqual([
      "cafe",
      "lunt",
    ]);
  });

  it("step 3: de-duplicates after normalisation, keeping first-seen order", () => {
    expect(SearchKeyword.parse("b a B ｂ A c")?.terms).toEqual(["b", "a", "c"]);
  });

  it("step 4: empty or whitespace-only is null", () => {
    expect(SearchKeyword.parse("")).toBeNull();
    expect(SearchKeyword.parse(" 　 \t")).toBeNull();
  });

  it("terms are always non-empty, normalised and unique", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (s) => {
        const keyword = SearchKeyword.parse(s);
        if (keyword === null) return;
        expect(keyword.terms.length).toBeGreaterThan(0);
        expect(new Set(keyword.terms).size).toBe(keyword.terms.length);
        for (const term of keyword.terms) {
          expect(term.length).toBeGreaterThan(0);
          expect(/\s/u.test(term)).toBe(false);
        }
      }),
    );
  });
});

describe("SearchKeyword.create / equals", () => {
  it("create rejects what parse maps to null", () => {
    expectBusinessError(() => SearchKeyword.create(""), CODE);
    expectBusinessError(() => SearchKeyword.create("　"), CODE);
  });

  it("create returns the parsed keyword", () => {
    expect(SearchKeyword.create("Cafe").terms).toEqual(["cafe"]);
  });

  it("equality includes order", () => {
    const ab = SearchKeyword.create("a b");
    expect(SearchKeyword.equals(ab, SearchKeyword.create("A  B"))).toBe(true);
    expect(SearchKeyword.equals(ab, SearchKeyword.create("b a"))).toBe(false);
    expect(SearchKeyword.equals(ab, SearchKeyword.create("a"))).toBe(false);
  });
});

describe("KeywordRelevance.termScore", () => {
  const text: SearchableText = {
    primary: "CAFE Lunt",
    secondary: ["東京都渋谷区神宮前1-2-3", "ランチ"],
  };

  it.each([
    ["primary equals the term → 4", "cafe lunt", 4],
    ["primary starts with the term → 3", "cafe", 3],
    ["primary contains the term → 2", "lunt", 2],
    ["a secondary contains the term → 1", "渋谷区", 1],
    ["nothing contains the term → 0", "喫茶", 0],
  ])("%s", (_label, term, score) => {
    expect(KeywordRelevance.termScore(text, term)).toBe(score);
  });

  it("normalises both sides (full-width / case / spaces)", () => {
    expect(
      KeywordRelevance.termScore(
        { primary: "ｃａｆｅ　Ｌｕｎｔ", secondary: [] },
        "CafeLunt",
      ),
    ).toBe(4);
  });

  it("primary wins over secondary", () => {
    expect(
      KeywordRelevance.termScore(
        { primary: "ランチ", secondary: ["ランチ"] },
        "ランチ",
      ),
    ).toBe(4);
  });

  it("an empty term scores 0", () => {
    expect(KeywordRelevance.termScore(text, " ")).toBe(0);
  });
});

describe("KeywordRelevance.relevance / matches", () => {
  const text: SearchableText = {
    primary: "カフェ山田",
    secondary: ["東京都渋谷区"],
  };

  it("sums termScores when every term scores at least 1", () => {
    expect(
      KeywordRelevance.relevance(text, SearchKeyword.create("カフェ 渋谷")),
    ).toBe(4);
    expect(
      KeywordRelevance.relevance(text, SearchKeyword.create("カフェ山田")),
    ).toBe(4);
    expect(
      KeywordRelevance.matches(text, SearchKeyword.create("山田 東京")),
    ).toBe(true);
  });

  it("is 0 when any term scores 0", () => {
    expect(
      KeywordRelevance.relevance(text, SearchKeyword.create("カフェ 大阪")),
    ).toBe(0);
    expect(
      KeywordRelevance.matches(text, SearchKeyword.create("カフェ 大阪")),
    ).toBe(false);
  });

  it("matches iff relevance >= 1, and relevance is 0 or between terms and 4*terms", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 20 }),
        fc.array(fc.string({ maxLength: 20 }), { maxLength: 3 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (primary, secondary, raw) => {
          const keyword = SearchKeyword.parse(raw);
          if (keyword === null) return;
          const t = { primary, secondary };
          const r = KeywordRelevance.relevance(t, keyword);
          expect(KeywordRelevance.matches(t, keyword)).toBe(r >= 1);
          if (r > 0) {
            expect(r).toBeGreaterThanOrEqual(keyword.terms.length);
            expect(r).toBeLessThanOrEqual(4 * keyword.terms.length);
          }
        },
      ),
    );
  });
});
