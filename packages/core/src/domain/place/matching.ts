import { Address } from "@repo/core/domain/common/address";
import {
  KeywordRelevance,
  type SearchableText,
} from "@repo/core/domain/common/searchKeyword";
import { TextNormalization } from "@repo/core/domain/common/textNormalization";
import { BusinessRuleError } from "@repo/core/domain/error";
import { PlaceErrorCode } from "./errorCode";
import type { Place } from "./place";

declare const matchTextBrand: unique symbol;

/** A normalized, non-empty term of 照合 (`PlaceMatching.normalize`). */
export type MatchText = string & { readonly [matchTextBrand]: true };

/**
 * 照合の条件: a name term, an address term, or both, and whether suspended
 * places are included (`false` for 既存店舗の確認, `true` for the
 * operator's and the application review's matching).
 */
export type PlaceMatchCriteria = Readonly<{
  text:
    | Readonly<{ name: MatchText; address: MatchText | null }>
    | Readonly<{ name: null; address: MatchText }>;
  includeSuspended: boolean;
}>;

const normalize = (input: string): string => TextNormalization.normalize(input);

export const MatchText = {
  /** Normalizes; throws `PLACE_INVALID_MATCH_TEXT` when nothing is left. */
  create: (input: string): MatchText => {
    const value = normalize(input);
    if (value.length === 0) {
      throw new BusinessRuleError(
        PlaceErrorCode.InvalidMatchText,
        "Match text must not be blank",
      );
    }
    return value as MatchText;
  },
};

const termOrNull = (input: string | null): MatchText | null =>
  input === null || normalize(input).length === 0
    ? null
    : MatchText.create(input);

export const PlaceMatchCriteria = {
  /**
   * A blank or `null` name / address counts as not entered; both absent is
   * `PLACE_INVALID_MATCH_CRITERIA`.
   */
  create: (
    input: Readonly<{
      name: string | null;
      address: string | null;
      includeSuspended: boolean;
    }>,
  ): PlaceMatchCriteria => {
    const name = termOrNull(input.name);
    const address = termOrNull(input.address);
    if (name !== null) {
      return {
        text: { name, address },
        includeSuspended: input.includeSuspended,
      };
    }
    if (address !== null) {
      return {
        text: { name: null, address },
        includeSuspended: input.includeSuspended,
      };
    }
    throw new BusinessRuleError(
      PlaceErrorCode.InvalidMatchCriteria,
      "Enter a name or an address",
    );
  },
};

/**
 * The two texts a place is matched on: its name and its address as
 * `Address.text`. Lets the store score a stored row without rebuilding the
 * aggregate.
 */
export type MatchableFields = Readonly<{ name: string; addressText: string }>;

/**
 * 4 / 3 / 2 when the value equals / starts with / contains the term
 * (`KeywordRelevance.termScore`); otherwise 1 when the non-empty value is
 * contained in the term (「カフェ山田 本店」 finds 「カフェ山田」); else 0.
 */
function fieldScore(value: string, text: MatchText): number {
  const score = KeywordRelevance.termScore(
    { primary: value, secondary: [] },
    text,
  );
  if (score >= 1) return score;
  const normalized = normalize(value);
  return normalized.length > 0 && text.includes(normalized) ? 1 : 0;
}

function relevanceOf(
  fields: MatchableFields,
  criteria: PlaceMatchCriteria,
): number {
  const { name, address } = criteria.text;
  return (
    (name === null ? 0 : fieldScore(fields.name, name)) +
    (address === null ? 0 : fieldScore(fields.addressText, address))
  );
}

function matchesFields(
  fields: MatchableFields,
  suspended: boolean,
  criteria: PlaceMatchCriteria,
): boolean {
  return (
    relevanceOf(fields, criteria) >= 1 &&
    (criteria.includeSuspended || !suspended)
  );
}

const fieldsOf = (place: Place): MatchableFields => ({
  name: place.profile.name,
  addressText: Address.text(place.profile.address),
});

/**
 * 照合 and the text keyword search is scored on. Pure; the one definition
 * every backend follows. Operating status never filters.
 */
export const PlaceMatching = {
  /** `TextNormalization.normalize`. */
  normalize,
  fieldScore,
  /** Name score (0 without a name term) plus address score (0 without an address term). */
  relevance: (place: Place, criteria: PlaceMatchCriteria): number =>
    relevanceOf(fieldsOf(place), criteria),
  /** `relevance ≥ 1`, and suspended places only when `includeSuspended`. */
  matches: (place: Place, criteria: PlaceMatchCriteria): boolean =>
    matchesFields(fieldsOf(place), place.suspension.suspended, criteria),
  /** `relevance` over stored texts (same result as for the aggregate). */
  relevanceOf,
  /** `matches` over stored texts (same result as for the aggregate). */
  matchesFields,
  /** `primary` is the name, `secondary` the one `Address.text`. */
  searchableText: (place: Place): SearchableText => ({
    primary: place.profile.name,
    secondary: [Address.text(place.profile.address)],
  }),
};
