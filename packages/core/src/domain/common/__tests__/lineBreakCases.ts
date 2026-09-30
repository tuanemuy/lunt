import { LINE_BREAK_CHARACTERS } from "@repo/core/domain/common/lineBreak";

const label = (c: string): string =>
  `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;

/** `[U+XXXX, character]` for each line break, for `it.each`. */
export const LINE_BREAK_CASES: readonly (readonly [string, string])[] =
  LINE_BREAK_CHARACTERS.map((c) => [label(c), c] as const);
