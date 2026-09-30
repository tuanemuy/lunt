import { Pagination } from "@repo/core/domain/common/pagination";
import {
  type OccasionSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import type { ServiceArgs } from "../types";
import {
  occasionSummaryPhotoIds,
  type PhotoRefs,
  photoRefsOf,
  todayOf,
} from "./views";

export type ListOccasionsInput = Readonly<{ pagination: Pagination }>;

export type ListOccasionsOutput = Readonly<{
  /** By period start, then end; each with its holding status. */
  items: readonly OccasionSummary[];
  count: number;
  photos: PhotoRefs;
}>;

/**
 * VW-07 (EXP-08): the upcoming and ongoing occasions (participants or
 * not), by period. Discovery scene: ended and cancelled occasions are left
 * out. No browse criteria apply. Needs no login.
 *
 * @throws BusinessRuleError `COMMON_INVALID_INPUT` for a pagination out of
 *   bounds.
 */
export async function listOccasions({
  container,
  input,
}: ServiceArgs<ListOccasionsInput>): Promise<ListOccasionsOutput> {
  const pagination = Pagination.create(input.pagination);
  const today = todayOf(container);
  const page = await container.explorationQueries.findOccasions(
    today,
    pagination,
  );
  const items = page.items.map((occasion) =>
    ViewProjection.occasionSummary(occasion, today),
  );
  return {
    items,
    count: page.count,
    photos: await photoRefsOf(
      container,
      items.flatMap(occasionSummaryPhotoIds),
    ),
  };
}
