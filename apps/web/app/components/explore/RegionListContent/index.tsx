import { loadRegionListScreen } from "@/presentation/exploreData";
import type { RegionListTab } from "@/presentation/exploreView";
import { RegionListView } from "../RegionListView";

/** VW-06's body as a server component: the region's name and one list, or CS-06. */
export async function RegionListContent({
  regionId,
  tab,
}: {
  regionId: string;
  tab: RegionListTab;
}) {
  return <RegionListView screen={await loadRegionListScreen(regionId, tab)} />;
}
