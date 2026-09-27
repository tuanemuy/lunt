import { classifyError } from "@/presentation/errorState";
import { searchListings, searchPlaces } from "@/presentation/opsData";
import { OPS_SEARCH_PAGE_SIZE, type OpsSearch } from "@/presentation/opsSearch";
import {
  ListingResults,
  PlaceResults,
  SearchFailure,
} from "../OpsSearchResults";

const FIRST_PAGE = { page: 1, limit: OPS_SEARCH_PAGE_SIZE } as const;

/**
 * OM-02's first page of results for the URL's search, read on the
 * server. A store search without a name or an address is not run (the
 * form refuses it; a hand-edited URL shows the forms alone).
 */
export async function OpsSearchResultsContent({
  search,
}: {
  search: OpsSearch;
}) {
  try {
    if (search.kind === "place") {
      const name = search.name?.trim() ?? "";
      const address = search.address?.trim() ?? "";
      if (name === "" && address === "") return null;
      const first = await searchPlaces(name, address, FIRST_PAGE);
      return (
        <PlaceResults
          key={`${name}|${address}`}
          first={first}
          name={name}
          address={address}
        />
      );
    }
    if (search.kind === "keyword") {
      const keyword = search.q?.trim() ?? "";
      if (keyword === "") return null;
      const first = await searchListings(keyword, FIRST_PAGE);
      return <ListingResults key={keyword} first={first} keyword={keyword} />;
    }
    return null;
  } catch (error) {
    const state = classifyError(error);
    return <SearchFailure kind={state.kind} message={state.message} />;
  }
}
