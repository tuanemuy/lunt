import type { RegionId } from "@repo/core/domain/common/ids";
import { Pagination } from "@repo/core/domain/common/pagination";
import {
  type PlaceSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { REGION_NOT_FOUND } from "./viewRegion";
import { type PhotoRefs, photoRefsOf, placeSummaryPhotoIds } from "./views";

export type ListPlacesOfRegionInput = Readonly<{
  regionId: RegionId;
  pagination: Pagination;
}>;

export type ListPlacesOfRegionOutput = Readonly<{
  /**
   * Newest affiliation first. Each names this region (not its
   * representative) and carries its operating status.
   */
  items: readonly PlaceSummary[];
  count: number;
  photos: PhotoRefs;
}>;

/**
 * DT-03's place section and VW-06 (EXP-04, EXP-05): the places affiliated
 * with a region, in the discovery scene — permanently closed places are
 * left out, temporarily closed ones shown with their standing. No browse
 * criteria apply. Needs no login.
 *
 * @throws NotFoundError `REGION_NOT_FOUND` when the region is not viewable
 *   or missing.
 * @throws BusinessRuleError `COMMON_INVALID_INPUT` for a pagination out of
 *   bounds.
 */
export async function listPlacesOfRegion({
  container,
  input,
}: ServiceArgs<ListPlacesOfRegionInput>): Promise<ListPlacesOfRegionOutput> {
  const pagination = Pagination.create(input.pagination);
  const region = await container.detailQueries.findRegion(input.regionId);
  if (region === null) {
    throw new NotFoundError(REGION_NOT_FOUND, "The region is not viewable");
  }
  const page = await container.explorationQueries.findPlacesOfRegion(
    region.id,
    pagination,
  );
  const items = page.items.map((entry) =>
    ViewProjection.placeSummary(entry, { kind: "within", regionId: region.id }),
  );
  return {
    items,
    count: page.count,
    photos: await photoRefsOf(container, items.flatMap(placeSummaryPhotoIds)),
  };
}
