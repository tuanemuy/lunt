import type { AreaCode } from "@repo/core/domain/common/areaCode";
import type { GeoBounds } from "@repo/core/domain/common/geo";
import type { RegionId } from "@repo/core/domain/common/ids";
import { Pagination } from "@repo/core/domain/common/pagination";
import type { BrowseCriteria } from "@repo/core/domain/discovery/browseCriteria";
import { MapGrid } from "@repo/core/domain/discovery/geo";
import type { ExplorationQueries } from "@repo/core/domain/discovery/ports/explorationQueries";
import {
  type RegionSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import type { ServiceArgs } from "../types";
import { type BrowseCriteriaInput, resolveBrowseCriteria } from "./criteria";
import {
  type BoundsInput,
  boundsFromInput,
  type PhotoRefs,
  type PlaceCellView,
  photoRefsOf,
  placeCellPhotoIds,
  placeCellView,
  regionSummaryPhotoIds,
  todayOf,
} from "./views";

export type ReadMapCellsInput = Readonly<{
  bounds: BoundsInput;
  /** Positive integer columns and rows; their upper bound is the transport's. */
  grid: Readonly<{ columns: number; rows: number }>;
  criteria: BrowseCriteriaInput;
  /** The region picked on the map (or DT-03's region); `null` for none. */
  selectedRegionId: RegionId | null;
}>;

export type ReadMapCellsOutput = Readonly<{
  /**
   * By row, then column; a place shows once whatever its region. Places of
   * the selected region are marked `affiliated` (clusters count them).
   */
  cells: readonly PlaceCellView[];
  /**
   * Every region located inside the range that matches the area
   * condition, newest first (categories never apply). One point each.
   */
  regions: readonly RegionSummary[];
  /**
   * The selected region whatever the range and criteria; `null` without
   * one or when it is no longer viewable (its places are then not added).
   */
  selectedRegion: RegionSummary | null;
  effective: BrowseCriteria;
  photos: PhotoRefs;
}>;

const ALL_PAGES = Pagination.create({ page: 1, limit: Pagination.maxLimit });

/**
 * Every page of `findRegions` inside the range: the map never cuts its
 * regions by count (`spec/domains/discovery.md` 「ExplorationQueries」).
 */
export async function regionsInBounds(
  explorationQueries: ExplorationQueries,
  bounds: GeoBounds,
  areaCodes: ReadonlySet<AreaCode> | null,
): Promise<readonly PublishedRegion[]> {
  const regions: PublishedRegion[] = [];
  for (let page = 1; ; page += 1) {
    const read = await explorationQueries.findRegions(
      { bounds, areaCodes, vicinity: null, origin: null },
      { page, limit: ALL_PAGES.limit },
    );
    regions.push(...read.items);
    if (read.items.length < ALL_PAGES.limit || regions.length >= read.count) {
      return regions;
    }
  }
}

/**
 * VW-04 (EXP-01): the places and regions of a map range in the discovery
 * scene. Places come grouped into cells (`MapClustering.cells`): a single
 * place, a cluster to zoom into, or places sharing one spot to pick from.
 * While a region is selected its affiliated places join whatever the
 * criteria and are told apart by `affiliatedCount` and each summary's
 * region. Needs no login.
 *
 * @throws BusinessRuleError `DISCOVERY_INVALID_MAP_GRID`,
 *   `COMMON_INVALID_GEO_POINT`, `COMMON_INVALID_GEO_BOUNDS`, or a malformed
 *   area or category code.
 */
export async function readMapCells({
  container,
  input,
}: ServiceArgs<ReadMapCellsInput>): Promise<ReadMapCellsOutput> {
  const bounds = boundsFromInput(input.bounds);
  const grid = MapGrid.create(input.grid.columns, input.grid.rows);
  const criteria = await resolveBrowseCriteria(container, input.criteria);
  const today = todayOf(container);
  const selected =
    input.selectedRegionId === null
      ? null
      : await container.detailQueries.findRegion(input.selectedRegionId);
  const selectedRegionId = selected?.id ?? null;
  const cells = (
    await container.explorationQueries.findPlaceCells({
      bounds,
      grid,
      criteria,
      selectedRegionId,
      today,
    })
  ).map((cell) => placeCellView(cell, selectedRegionId));
  const regions = (
    await regionsInBounds(
      container.explorationQueries,
      bounds,
      criteria.areaCodes,
    )
  ).map(ViewProjection.regionSummary);
  const selectedRegion =
    selected === null ? null : ViewProjection.regionSummary(selected);
  return {
    cells,
    regions,
    selectedRegion,
    effective: criteria.effective,
    photos: await photoRefsOf(container, [
      ...cells.flatMap(placeCellPhotoIds),
      ...regions.flatMap(regionSummaryPhotoIds),
      ...(selectedRegion === null ? [] : regionSummaryPhotoIds(selectedRegion)),
    ]),
  };
}
