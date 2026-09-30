import { Pagination } from "@repo/core/domain/common/pagination";
import type { BrowseCriteria } from "@repo/core/domain/discovery/browseCriteria";
import {
  type PlaceSummary,
  type RegionSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import type { ServiceArgs } from "../types";
import { type BrowseCriteriaInput, resolveBrowseCriteria } from "./criteria";
import {
  type BoundsInput,
  boundsFromInput,
  type PhotoRefs,
  type PointInput,
  photoRefsOf,
  placeSummaryPhotoIds,
  pointFromInput,
  regionSummaryPhotoIds,
  todayOf,
} from "./views";

/** Which lists to read: both, or only places or regions (e.g. "read more"). */
export type MapTargetKinds = "all" | "places" | "regions";

export type ListMapTargetsInput = Readonly<{
  bounds: BoundsInput;
  criteria: BrowseCriteriaInput;
  /** Nearest first when shared, else newest first. */
  origin: PointInput | null;
  kinds: MapTargetKinds;
  /** Applies to each kind read, independently. */
  pagination: Pagination;
}>;

export type SummaryPage<T> = Readonly<{ items: readonly T[]; count: number }>;

export type ListMapTargetsOutput = Readonly<{
  /** `null` when not read. Operating status and displayed region named. */
  places: SummaryPage<PlaceSummary> | null;
  /** `null` when not read. */
  regions: SummaryPage<RegionSummary> | null;
  effective: BrowseCriteria;
  photos: PhotoRefs;
}>;

/**
 * VW-04's list (EXP-02): the places and regions of the same range and
 * criteria as `readMapCells` with no region selected, per kind, nearest
 * first with the viewer's position or newest first without, each kind
 * paged on its own. Discovery scene; needs no login.
 *
 * @throws BusinessRuleError `COMMON_INVALID_INPUT` for a pagination out of
 *   bounds, `COMMON_INVALID_GEO_POINT`, `COMMON_INVALID_GEO_BOUNDS`, or a
 *   malformed area or category code.
 */
export async function listMapTargets({
  container,
  input,
}: ServiceArgs<ListMapTargetsInput>): Promise<ListMapTargetsOutput> {
  const pagination = Pagination.create(input.pagination);
  const bounds = boundsFromInput(input.bounds);
  const origin = input.origin === null ? null : pointFromInput(input.origin);
  const criteria = await resolveBrowseCriteria(container, input.criteria);
  const readPlaces = input.kinds !== "regions";
  const readRegions = input.kinds !== "places";
  const places = readPlaces
    ? await container.explorationQueries.findPlacesInBounds(
        { bounds, criteria, origin, today: todayOf(container) },
        pagination,
      )
    : null;
  const regions = readRegions
    ? await container.explorationQueries.findRegions(
        { bounds, areaCodes: criteria.areaCodes, vicinity: null, origin },
        pagination,
      )
    : null;
  const placeItems =
    places?.items.map((entry) =>
      ViewProjection.placeSummary(entry, { kind: "displayed" }),
    ) ?? [];
  const regionItems = regions?.items.map(ViewProjection.regionSummary) ?? [];
  return {
    places: places === null ? null : { items: placeItems, count: places.count },
    regions:
      regions === null ? null : { items: regionItems, count: regions.count },
    effective: criteria.effective,
    photos: await photoRefsOf(container, [
      ...placeItems.flatMap(placeSummaryPhotoIds),
      ...regionItems.flatMap(regionSummaryPhotoIds),
    ]),
  };
}
