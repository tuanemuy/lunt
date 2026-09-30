import {
  loadRegionListScreen,
  type RegionListHead,
} from "@/presentation/exploreData";
import type { RegionListTab } from "@/presentation/exploreView";
import { RegionListView } from "../RegionListView";

/**
 * VW-06's body as a server component: the region's name and one list, or
 * CS-06. `head` is the region read the route already started.
 */
export async function RegionListContent({
  regionId,
  tab,
  head,
}: {
  regionId: string;
  tab: RegionListTab;
  head: Promise<RegionListHead | null>;
}) {
  return (
    <RegionListView screen={await loadRegionListScreen(regionId, tab, head)} />
  );
}
