import {
  AreaSelection,
  type AreaSelectionInput,
  type AreaSelectionLabel,
} from "@repo/core/domain/area/areaSelection";
import type { ServiceArgs } from "../types";

export type LabelAreaSelectionsInput = Readonly<{
  selections: readonly AreaSelectionInput[];
}>;

/**
 * The chosen area conditions with the names the screen shows (DIS-04;
 * CF-03, VW-02): equal selections once, in first-occurrence order;
 * selections of codes the master lacks left out; `[]` for no condition.
 * No actor.
 *
 * Errors: `AREA_INVALID_PREFECTURE_CODE`, `AREA_INVALID_MUNICIPALITY_CODE`,
 * `COMMON_INVALID_AREA_CODE` for a code in the wrong format.
 */
export async function labelAreaSelections({
  container,
  input,
}: ServiceArgs<LabelAreaSelectionsInput>): Promise<
  readonly AreaSelectionLabel[]
> {
  const selections = AreaSelection.dedupe(
    input.selections.map(AreaSelection.create),
  );
  if (selections.length === 0) return [];
  return container.areaCatalog.labelSelections(selections);
}
