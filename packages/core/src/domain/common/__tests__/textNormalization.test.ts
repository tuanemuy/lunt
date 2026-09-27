import { TextNormalization } from "@repo/core/domain/common/textNormalization";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("TextNormalization.normalize (NFKC → default lowercase → strip whitespace)", () => {
  it.each([
    ["full-width ASCII folds under NFKC", "ＣＡＦＥ", "cafe"],
    ["half-width kana folds under NFKC", "ｶﾌｪ", "カフェ"],
    ["ASCII uppercase is lowercased", "Cafe Lunt", "cafelunt"],
    ["non-ASCII letters are lowercased too", "ÉCOLE Ωmega", "écoleωmega"],
    ["full-width space is removed", "カフェ　山田", "カフェ山田"],
    ["tabs / newlines / NBSP are removed", " a\tb\nc d ", "abcd"],
    ["compatibility characters expand", "㍿", "株式会社"],
  ])("%s", (_label, input, expected) => {
    expect(TextNormalization.normalize(input)).toBe(expected);
  });

  it("lowercases after NFKC: a full-width capital becomes its ASCII lowercase", () => {
    expect(TextNormalization.normalize("Ａ")).toBe("a");
  });

  it("is locale-independent (Turkish dotted I uses the default mapping)", () => {
    expect(TextNormalization.normalize("I")).toBe("i");
    expect(TextNormalization.normalize("İ")).toBe("i̇");
  });

  it("is idempotent and never leaves whitespace", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme" }), (s) => {
        const once = TextNormalization.normalize(s);
        expect(TextNormalization.normalize(once)).toBe(once);
        expect(/\s/u.test(once)).toBe(false);
      }),
    );
  });

  it("characterCount counts code points, not UTF-16 units", () => {
    expect(TextNormalization.characterCount("😀a")).toBe(2);
    expect(TextNormalization.characterCount("")).toBe(0);
  });
});
