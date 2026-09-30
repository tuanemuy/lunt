// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.

import { getContainer } from "@repo/core/application/di/containerStore";
import type { BrowseCriteriaInput } from "@repo/core/application/discovery/criteria";
import { findMapExtent } from "@repo/core/application/discovery/findMapExtent";
import {
  listMapTargets,
  type MapTargetKinds,
} from "@repo/core/application/discovery/listMapTargets";
import { locateParticipants } from "@repo/core/application/discovery/locateParticipants";
import { readMapCells } from "@repo/core/application/discovery/readMapCells";
import type { PointInput } from "@repo/core/application/discovery/views";
import { NotFoundError } from "@repo/core/application/errors";
import type { AreaSelectionInput } from "@repo/core/domain/area/areaSelection";
import { OccasionId, RegionId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import type { ConditionItem } from "./exploreView";
import {
  MAP_LIST_PAGE_SIZE,
  type MapExtent,
  type MapRange,
  type MapRead,
  type MapTargets,
  type ParticipantsRead,
  toMapExtent,
  toMapRead,
  toMapTargets,
  toParticipantsRead,
} from "./mapView";

type Grid = Readonly<{ columns: number; rows: number }>;

/**
 * VW-04's first screen: the CF-03 chips and the first range — the
 * region's (`regionId`, opened from DT-03), else the chosen areas', else
 * every discoverable place's. A region that is not viewable (or not a
 * region id) falls back to the areas' range and is reported `regionGone`.
 */
export async function loadMapScreen(
  criteria: BrowseCriteriaInput,
  regionId: string | null,
): Promise<
  Readonly<{
    conditions: readonly ConditionItem[];
    extent: MapExtent;
    regionId: string | null;
    regionGone: boolean;
  }>
> {
  const container = await getContainer();
  const { loadConditionItems } = await import("./exploreData");
  const focusExtent = () =>
    findMapExtent({
      container,
      input: { kind: "focus", areas: criteria.areas, origin: null },
    }).then(toMapExtent);
  const regionExtent = async (): Promise<MapExtent | null> => {
    if (regionId === null) return null;
    try {
      const extent = toMapExtent(
        await findMapExtent({
          container,
          input: { kind: "region", regionId: RegionId.create(regionId) },
        }),
      );
      return extent.range === null ? null : extent;
    } catch (error) {
      if (error instanceof BusinessRuleError) return null;
      throw error;
    }
  };
  const [conditions, region] = await Promise.all([
    loadConditionItems(criteria),
    regionExtent(),
  ]);
  if (region !== null) {
    return { conditions, extent: region, regionId, regionGone: false };
  }
  return {
    conditions,
    extent: await focusExtent(),
    regionId: null,
    regionGone: regionId !== null,
  };
}

/**
 * VW-04's range once the viewer shares a position: the areas' range when
 * any are chosen, else the rectangle around the vicinity.
 */
export async function loadMapExtent(
  areas: readonly AreaSelectionInput[],
  origin: PointInput,
): Promise<MapExtent> {
  const container = await getContainer();
  return toMapExtent(
    await findMapExtent({
      container,
      input: { kind: "focus", areas, origin },
    }),
  );
}

/** VW-04's cells and regions for a range (`readMapCells`). */
export async function loadMapCells(
  bounds: MapRange,
  grid: Grid,
  criteria: BrowseCriteriaInput,
  selectedRegionId: string | null,
): Promise<MapRead> {
  const container = await getContainer();
  return toMapRead(
    await readMapCells({
      container,
      input: {
        bounds,
        grid,
        criteria,
        selectedRegionId:
          selectedRegionId === null ? null : RegionId.create(selectedRegionId),
      },
    }),
  );
}

/** A page of VW-04's list of one kind or both (`listMapTargets`). */
export async function loadMapTargets(
  bounds: MapRange,
  criteria: BrowseCriteriaInput,
  origin: PointInput | null,
  kinds: MapTargetKinds,
  page: number,
): Promise<MapTargets> {
  const container = await getContainer();
  return toMapTargets(
    await listMapTargets({
      container,
      input: {
        bounds,
        criteria,
        origin,
        kinds,
        pagination: { page, limit: MAP_LIST_PAGE_SIZE },
      },
    }),
  );
}

/** VW-08's cells for a range, or for every participant when `bounds` is `null`. */
export async function loadParticipantCells(
  occasionId: string,
  bounds: MapRange | null,
  grid: Grid,
): Promise<ParticipantsRead> {
  const container = await getContainer();
  return toParticipantsRead(
    await locateParticipants({
      container,
      input: { occasionId: OccasionId.create(occasionId), bounds, grid },
    }),
  );
}

/**
 * VW-08's first screen: the occasion's name and the range of every
 * participant (`null`: none, CS-09), or `unavailable` for an occasion that
 * is not viewable (CS-06). Told apart here because an error reaches the
 * browser only as its kind.
 */
export async function loadParticipantsScreen(
  occasionId: string,
): Promise<
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "ready"; occasionName: string; extent: MapRange | null }>
> {
  try {
    const { occasionName, extent } = await loadParticipantCells(
      occasionId,
      null,
      { columns: 1, rows: 1 },
    );
    return { kind: "ready", occasionName, extent };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BusinessRuleError) {
      return { kind: "unavailable" };
    }
    throw error;
  }
}
