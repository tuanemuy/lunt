import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { TextNormalization } from "@repo/core/domain/common/textNormalization";
import { BusinessRuleError } from "@repo/core/domain/error";

declare const searchKeywordBrand: unique symbol;

/** Normalised, de-duplicated terms in first-seen order. */
export type SearchKeyword = Readonly<{
  terms: readonly [string, ...string[]];
}> & { readonly [searchKeywordBrand]: true };

/**
 * A target's matchable text. `primary` is its name; `secondary` holds the
 * other matchable values, omitting absent ones. Each domain's
 * `searchableText` function is the only producer.
 */
export type SearchableText = Readonly<{
  primary: string;
  secondary: readonly string[];
}>;

export type TermScore = 0 | 1 | 2 | 3 | 4;

const MAX_LENGTH = 100;
const WHITESPACE_RUN = /\s+/u;

const invalidKeyword = (): BusinessRuleError<CommonErrorCode> =>
  new BusinessRuleError(
    CommonErrorCode.InvalidSearchKeyword,
    `Search keyword must be 1-${MAX_LENGTH} characters`,
  );

/**
 * 1. over 100 characters after trimming → `COMMON_INVALID_SEARCH_KEYWORD`;
 * 2. NFKC, split on whitespace (full-width spaces become ASCII under NFKC);
 * 3. normalise each term, drop empties, de-duplicate keeping first-seen order;
 * 4. no terms left → `null`.
 */
const parse = (input: string): SearchKeyword | null => {
  const trimmed = input.trim();
  if (TextNormalization.characterCount(trimmed) > MAX_LENGTH) {
    throw invalidKeyword();
  }
  const terms: string[] = [];
  for (const word of trimmed.normalize("NFKC").split(WHITESPACE_RUN)) {
    const term = TextNormalization.normalize(word);
    if (term.length > 0 && !terms.includes(term)) terms.push(term);
  }
  const [first, ...rest] = terms;
  if (first === undefined) return null;
  const keywordTerms: readonly [string, ...string[]] = [first, ...rest];
  return { terms: keywordTerms } as SearchKeyword;
};

export const SearchKeyword = {
  maxLength: MAX_LENGTH,
  parse,

  /** `parse`, but an empty / blank keyword is `COMMON_INVALID_SEARCH_KEYWORD` too. */
  create: (input: string): SearchKeyword => {
    const keyword = parse(input);
    if (keyword === null) throw invalidKeyword();
    return keyword;
  },

  /**
   * Rebuilds a keyword from the terms of one `parse` / `create` produced
   * (e.g. sent across the state object's RPC). The terms are normalised
   * and de-duplicated again, but the length limit is not re-checked: it
   * bounds the text as entered, and NFKC may expand a term past it
   * (「㍿」 → 「株式会社」). `null` when no term is left.
   */
  fromTerms: (terms: readonly string[]): SearchKeyword | null => {
    const kept: string[] = [];
    for (const raw of terms) {
      const term = TextNormalization.normalize(raw);
      if (term.length > 0 && !kept.includes(term)) kept.push(term);
    }
    const [first, ...rest] = kept;
    if (first === undefined) return null;
    const keywordTerms: readonly [string, ...string[]] = [first, ...rest];
    return { terms: keywordTerms } as SearchKeyword;
  },

  /** Same terms in the same order. */
  equals: (a: SearchKeyword, b: SearchKeyword): boolean =>
    a.terms.length === b.terms.length &&
    a.terms.every((term, i) => term === b.terms[i]),
};

const termScore = (text: SearchableText, term: string): TermScore => {
  const needle = TextNormalization.normalize(term);
  // An empty needle is a prefix / substring of everything; it matches nothing
  // rather than everything. `SearchKeyword` never yields one.
  if (needle.length === 0) return 0;
  const primary = TextNormalization.normalize(text.primary);
  if (primary === needle) return 4;
  if (primary.startsWith(needle)) return 3;
  if (primary.includes(needle)) return 2;
  if (
    text.secondary.some((value) =>
      TextNormalization.normalize(value).includes(needle),
    )
  ) {
    return 1;
  }
  return 0;
};

const relevance = (text: SearchableText, keyword: SearchKeyword): number => {
  let total = 0;
  for (const term of keyword.terms) {
    const score = termScore(text, term);
    if (score === 0) return 0;
    total += score;
  }
  return total;
};

/** Keyword matching and ranking; matches sort by `relevance` descending. */
export const KeywordRelevance = {
  /**
   * After normalising both sides: `primary` equals the term → 4, starts with
   * it → 3, contains it → 2; otherwise any `secondary` containing it → 1;
   * else 0.
   */
  termScore,
  /** Sum of `termScore`s when every term scores ≥ 1; 0 as soon as one scores 0. */
  relevance,
  matches: (text: SearchableText, keyword: SearchKeyword): boolean =>
    relevance(text, keyword) >= 1,
};
