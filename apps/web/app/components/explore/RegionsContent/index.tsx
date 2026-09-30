import {
  type BrowseSearch,
  browseCriteriaOf,
  browseSearchKey,
} from "@/presentation/browseSearch";
import { loadRegionsScreen } from "@/presentation/exploreData";
import { RegionsBoard } from "../RegionsBoard";

/**
 * VW-05's body as a server component: the first page without the
 * viewer's position and the CF-03 chips, handed to `RegionsBoard`, which
 * is remounted when the conditions change.
 */
export async function RegionsContent({ search }: { search: BrowseSearch }) {
  const { page, conditions } = await loadRegionsScreen(
    browseCriteriaOf(search),
  );
  return (
    <RegionsBoard
      key={browseSearchKey(search)}
      search={search}
      first={page}
      conditions={conditions}
    />
  );
}
