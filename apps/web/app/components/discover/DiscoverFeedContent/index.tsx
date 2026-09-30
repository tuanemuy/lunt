import type { BrowseCriteriaInput } from "@repo/core/application/discovery/criteria";
import type { PointInput } from "@repo/core/application/discovery/views";
import type { BrowseSearch } from "@/presentation/browseSearch";
import { loadFeedScreen } from "@/presentation/discoverData";
import { DiscoverFeed } from "../DiscoverFeed";

/** VW-01's body: the feed's first screen, read on the server; the island loads the rest. */
export async function DiscoverFeedContent({
  search,
  criteria,
  origin,
}: {
  search: BrowseSearch;
  criteria: BrowseCriteriaInput;
  origin: PointInput | null;
}) {
  const screen = await loadFeedScreen(criteria, origin);
  return <DiscoverFeed screen={screen} search={search} origin={origin} />;
}
