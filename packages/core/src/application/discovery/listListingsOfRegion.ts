import type { RegionId } from "@repo/core/domain/common/ids";
import { Pagination } from "@repo/core/domain/common/pagination";
import {
  type ListingSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { REGION_NOT_FOUND } from "./viewRegion";
import {
  listingSummaryPhotoIds,
  type PhotoRefs,
  photoRefsOf,
  todayOf,
} from "./views";

export type ListListingsOfRegionInput = Readonly<{
  regionId: RegionId;
  pagination: Pagination;
}>;

export type ListListingsOfRegionOutput = Readonly<{
  /** Newest first; each names this region. */
  items: readonly ListingSummary[];
  /** 0 is 「地域に閲覧できる掲載がない」 (DT-03's CS-09), not an error. */
  count: number;
  photos: PhotoRefs;
}>;

/**
 * DT-03's listing section and VW-06 (EXP-04, EXP-05): the listings of the
 * places affiliated with a region, in the discovery scene — available
 * listings of places not permanently closed. No browse criteria apply.
 * Needs no login.
 *
 * @throws NotFoundError `REGION_NOT_FOUND` when the region is not viewable
 *   or missing.
 * @throws BusinessRuleError `COMMON_INVALID_INPUT` for a pagination out of
 *   bounds.
 */
export async function listListingsOfRegion({
  container,
  input,
}: ServiceArgs<ListListingsOfRegionInput>): Promise<ListListingsOfRegionOutput> {
  const pagination = Pagination.create(input.pagination);
  const today = todayOf(container);
  const region = await container.detailQueries.findRegion(input.regionId);
  if (region === null) {
    throw new NotFoundError(REGION_NOT_FOUND, "The region is not viewable");
  }
  const page = await container.explorationQueries.findListingsOfRegion(
    { regionId: region.id, excludingPlaceId: null, today },
    pagination,
  );
  const items = page.items.map((entry) =>
    ViewProjection.listingSummary(
      entry,
      { kind: "within", regionId: region.id },
      today,
    ),
  );
  return {
    items,
    count: page.count,
    photos: await photoRefsOf(container, items.flatMap(listingSummaryPhotoIds)),
  };
}
