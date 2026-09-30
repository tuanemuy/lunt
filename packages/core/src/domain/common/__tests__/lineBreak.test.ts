import {
  LINE_BREAK_CHARACTERS,
  LineBreak,
} from "@repo/core/domain/common/lineBreak";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LINE_BREAK_CASES } from "./lineBreakCases";

describe("LineBreak.contains", () => {
  it("defines exactly LF, VT, FF, CR, NEL, LS and PS", () => {
    expect(LINE_BREAK_CASES.map(([label]) => label)).toEqual([
      "U+000A",
      "U+000B",
      "U+000C",
      "U+000D",
      "U+0085",
      "U+2028",
      "U+2029",
    ]);
  });

  it.each(LINE_BREAK_CASES)("finds %s anywhere in the text", (_label, c) => {
    expect(LineBreak.contains(c)).toBe(true);
    expect(LineBreak.contains(`谷${c}中`)).toBe(true);
    expect(LineBreak.contains(`${c}谷中`)).toBe(true);
    expect(LineBreak.contains(`谷中${c}`)).toBe(true);
  });

  it.each([
    ["an empty string", ""],
    ["a tab", "a\tb"],
    ["an ASCII space", "a b"],
    ["a full-width space", "a　b"],
    ["a no-break space", "a\u00A0b"],
    ["a zero-width space", "a\u200Bb"],
    ["U+0084 next to NEL", "a\u0084b"],
    ["U+0086 next to NEL", "a\u0086b"],
    ["U+2027 next to LS", "a\u2027b"],
    ["U+202A next to PS", "a\u202Ab"],
    ["an emoji and a supplementary-plane kanji", "🍰𠮷"],
  ])("does not treat %s as a line break", (_label, text) => {
    expect(LineBreak.contains(text)).toBe(false);
  });

  it("is true exactly when one of the seven characters occurs", () => {
    const breaks: readonly string[] = LINE_BREAK_CHARACTERS;
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (s) => {
        const expected = [...s].some((c) => breaks.includes(c));
        expect(LineBreak.contains(s)).toBe(expected);
      }),
    );
  });
});
