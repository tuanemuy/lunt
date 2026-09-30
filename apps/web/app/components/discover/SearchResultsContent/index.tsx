import { loadSearchScreen } from "@/presentation/discoverData";
import { SearchResults } from "../SearchResults";

/** VW-03's results, read on the server; the island loads each kind's rest. */
export async function SearchResultsContent({ keyword }: { keyword: string }) {
  return <SearchResults screen={await loadSearchScreen(keyword)} />;
}
