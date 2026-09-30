import {
  AreaSelection,
  type AreaSelectionInput,
} from "@repo/core/domain/area/areaSelection";
import type { GeoBounds } from "@repo/core/domain/common/geo";
import type { RegionId } from "@repo/core/domain/common/ids";
import { ExplorationFocus } from "@repo/core/domain/discovery/explorationFocus";
import { Geo } from "@repo/core/domain/discovery/geo";
import type { ServiceArgs } from "../types";
import { type PointInput, pointFromInput } from "./views";

export type FindMapExtentInput =
  | Readonly<{
      kind: "focus";
      /** The chosen areas; empty for none. */
      areas: readonly AreaSelectionInput[];
      /** The viewer's position when shared; `null` otherwise. */
      origin: PointInput | null;
    }>
  | Readonly<{ kind: "region"; regionId: RegionId }>;

/**
 * What the first range rests on: the chosen areas, the viewer's vicinity,
 * every place (the screen shows CS-03 for this one when opened from the
 * navigation), or one region.
 */
export type MapExtentBasis = ExplorationFocus["kind"] | "region";

export type FindMapExtentOutput = Readonly<{
  basis: MapExtentBasis;
  /**
   * The range to open the map on. `Geo.JAPAN` when no place is gathered;
   * `null` only for a region that is not viewable.
   */
  extent: GeoBounds | null;
}>;

/**
 * VW-04's first range (EXP-01, EXP-04). From the chosen areas and the
 * viewer's position (`ExplorationFocus.of`, areas first): the range of the
 * discoverable places in the areas, the rectangle around the vicinity
 * (`Geo.boundsOf`, the same radius as the region list), or the range of
 * every discoverable place. Categories never apply. From a region: its
 * discovery footprint (its point and its shown places). Needs no login.
 *
 * @throws BusinessRuleError `COMMON_INVALID_GEO_POINT` or a malformed area
 *   code.
 */
export async function findMapExtent({
  container,
  input,
}: ServiceArgs<FindMapExtentInput>): Promise<FindMapExtentOutput> {
  if (input.kind === "region") {
    return {
      basis: "region",
      extent: await container.explorationQueries.findMapExtent({
        kind: "region",
        regionId: input.regionId,
      }),
    };
  }
  const origin = input.origin === null ? null : pointFromInput(input.origin);
  const areas = AreaSelection.dedupe(input.areas.map(AreaSelection.create));
  const areaCodes =
    areas.length === 0 ? null : await container.areaCatalog.expand(areas);
  const focus = ExplorationFocus.of(
    areaCodes,
    origin,
    container.discoverySettings.vicinityRadiusMeters,
  );
  if (focus.kind === "vicinity") {
    return { basis: focus.kind, extent: Geo.boundsOf(focus.vicinity) };
  }
  const extent = await container.explorationQueries.findMapExtent({
    kind: "places",
    areaCodes: focus.kind === "areas" ? focus.areaCodes : null,
  });
  return { basis: focus.kind, extent: extent ?? Geo.JAPAN };
}
