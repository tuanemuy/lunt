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

/**
 * A `SearchableText` normalised once, as stored for keyword search:
 * `primary` normalised, and every `secondary` value normalised and joined
 * by `SECONDARY_SEPARATOR`. Normalisation removes every whitespace
 * character, so neither a normalised value nor a needle holds the
 * separator: a needle is inside `secondary` exactly when it is inside one
 * of the values.
 */
export type NormalizedSearchableText = Readonly<{
  primary: string;
  secondary: string;
}>;

const SECONDARY_SEPARATOR = "\n";

const normalizeText = (text: SearchableText): NormalizedSearchableText => ({
  primary: TextNormalization.normalize(text.primary),
  secondary: text.secondary
    .map((value) => TextNormalization.normalize(value))
    .join(SECONDARY_SEPARATOR),
});

/** What each term is looked for as, in order: the term normalised. */
const needles = (keyword: SearchKeyword): readonly string[] =>
  keyword.terms.map((term) => TextNormalization.normalize(term));

/**
 * A normalised text as scoring sees it: the normalised `primary`, and
 * whether a needle is inside the normalised secondary values.
 */
export type ScoredText = Readonly<{
  primary: string;
  secondaryHas: (needle: string) => boolean;
}>;

const needleScore = (text: ScoredText, needle: string): TermScore => {
  // An empty needle is a prefix / substring of everything; it matches nothing
  // rather than everything. `SearchKeyword` never yields one.
  if (needle.length === 0) return 0;
  if (text.primary === needle) return 4;
  if (text.primary.startsWith(needle)) return 3;
  if (text.primary.includes(needle)) return 2;
  if (text.secondaryHas(needle)) return 1;
  return 0;
};

const scoredTextOf = (text: NormalizedSearchableText): ScoredText => ({
  primary: text.primary,
  secondaryHas: (needle) => text.secondary.includes(needle),
});

const termScore = (text: SearchableText, term: string): TermScore =>
  needleScore(
    scoredTextOf(normalizeText(text)),
    TextNormalization.normalize(term),
  );

const relevanceOfScored = (
  text: ScoredText,
  keyword: SearchKeyword,
): number => {
  let total = 0;
  for (const needle of needles(keyword)) {
    const score = needleScore(text, needle);
    if (score === 0) return 0;
    total += score;
  }
  return total;
};

const relevanceOfNormalized = (
  text: NormalizedSearchableText,
  keyword: SearchKeyword,
): number => relevanceOfScored(scoredTextOf(text), keyword);

const relevance = (text: SearchableText, keyword: SearchKeyword): number =>
  relevanceOfNormalized(normalizeText(text), keyword);

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
  /**
   * The text as stored for search. `relevanceOfNormalized(normalizeText(t), k)`
   * is `relevance(t, k)` by definition — `relevance` is computed that way.
   */
  normalizeText,
  /**
   * The keyword's needles. A term scores ≥ 1 exactly when its needle is a
   * substring of the normalised `primary` or `secondary`, which lets a store
   * narrow candidates before scoring them.
   */
  needles,
  /** `relevance` over text already normalised with `normalizeText`. */
  relevanceOfNormalized,
  /**
   * `relevanceOfNormalized` when only the primary text is at hand and the
   * secondary one is known by which needles it holds: `secondaryHas` is
   * asked about the keyword's needles only.
   */
  relevanceOfScored,
};
