import type { BrowseCriteriaInput } from "@repo/core/application/discovery/criteria";
import { loadFilterScreen } from "@/presentation/discoverData";
import { FilterPanel } from "../FilterPanel";

/** VW-02's body: the conditions as they stand and what to choose from, read on the server. */
export async function FilterContent({
  criteria,
}: {
  criteria: BrowseCriteriaInput;
}) {
  return <FilterPanel screen={await loadFilterScreen(criteria)} />;
}
