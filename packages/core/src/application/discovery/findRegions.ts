import { Pagination } from "@repo/core/domain/common/pagination";
import type { BrowseCriteria } from "@repo/core/domain/discovery/browseCriteria";
import { ExplorationFocus } from "@repo/core/domain/discovery/explorationFocus";
import {
  type RegionSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import type { ServiceArgs } from "../types";
import { type BrowseCriteriaInput, resolveBrowseCriteria } from "./criteria";
import {
  type PhotoRefs,
  type PointInput,
  photoRefsOf,
  pointFromInput,
  regionSummaryPhotoIds,
} from "./views";

export type FindRegionsInput = Readonly<{
  /** Only the area condition applies to regions. */
  criteria: BrowseCriteriaInput;
  /** The viewer's position when shared; `null` otherwise. */
  origin: PointInput | null;
  pagination: Pagination;
}>;

export type FindRegionsOutput = Readonly<{
  /**
   * Which regions these are (VW-05's states): those of the chosen areas,
   * of the vicinity, or all of them.
   */
  focus: ExplorationFocus["kind"];
  /** Nearest first with the viewer's position, else newest first. */
  items: readonly RegionSummary[];
  count: number;
  /** The conditions in force; chosen categories stay listed but do not apply. */
  effective: BrowseCriteria;
  photos: PhotoRefs;
}>;

/**
 * VW-05 (EXP-03, DIS-04, DIS-06): the regions of the chosen areas, else of
 * the viewer's vicinity, else every region (`ExplorationFocus.of`). A
 * region is in an area or the vicinity when its own point or a viewable
 * affiliated place's (closed ones included) is (`RegionFootprint`), and
 * its distance is the nearest of those points. Categories never apply.
 * Discovery scene; needs no login.
 *
 * @throws BusinessRuleError `COMMON_INVALID_INPUT` for a pagination out of
 *   bounds, `COMMON_INVALID_GEO_POINT`, or a malformed area or category
 *   code.
 */
export async function findRegions({
  container,
  input,
}: ServiceArgs<FindRegionsInput>): Promise<FindRegionsOutput> {
  const pagination = Pagination.create(input.pagination);
  const origin = input.origin === null ? null : pointFromInput(input.origin);
  const criteria = await resolveBrowseCriteria(container, input.criteria);
  const focus = ExplorationFocus.of(
    criteria.areaCodes,
    origin,
    container.discoverySettings.vicinityRadiusMeters,
  );
  const page = await container.explorationQueries.findRegions(
    {
      bounds: null,
      areaCodes: focus.kind === "areas" ? focus.areaCodes : null,
      vicinity: focus.kind === "vicinity" ? focus.vicinity : null,
      origin,
    },
    pagination,
  );
  const items = page.items.map(ViewProjection.regionSummary);
  return {
    focus: focus.kind,
    items,
    count: page.count,
    effective: criteria.effective,
    photos: await photoRefsOf(container, items.flatMap(regionSummaryPhotoIds)),
  };
}
