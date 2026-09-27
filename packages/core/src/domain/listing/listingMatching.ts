import type { SearchableText } from "@repo/core/domain/common/searchKeyword";
import type { Listing } from "./listing";

/**
 * A listing's matchable text from its stored name and description: the
 * name (empty when missing) is `primary`, the description (omitted when
 * missing) `secondary`. Stores that keep the two strings apply this to
 * them, so every backend matches the same text.
 */
const textOf = (
  name: string | null,
  description: string | null,
): SearchableText => ({
  primary: name ?? "",
  secondary: description === null ? [] : [description],
});

/**
 * What a keyword is matched against for a listing. The operator search
 * (`ListingRepository.searchForOperation`) and Discovery's keyword search
 * use this one definition with `KeywordRelevance`.
 */
export const ListingMatching = {
  searchableText: (listing: Listing): SearchableText =>
    textOf(listing.content.name, listing.content.description),
  textOf,
};
