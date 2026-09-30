/**
 * The characters a value rule means by 改行 (line break): LF, VT, FF, CR,
 * NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR. Every "one line" rule of
 * every domain checks against this one set.
 */
export const LINE_BREAK_CHARACTERS = [
  "\u000A",
  "\u000B",
  "\u000C",
  "\u000D",
  "\u0085",
  "\u2028",
  "\u2029",
] as const;

const LINE_BREAK = /[\n\v\f\r\u0085\u2028\u2029]/u;

export const LineBreak = {
  /** True when `text` has at least one of {@link LINE_BREAK_CHARACTERS}. */
  contains: (text: string): boolean => LINE_BREAK.test(text),
};
