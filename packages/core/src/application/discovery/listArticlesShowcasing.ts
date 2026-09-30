import { Pagination } from "@repo/core/domain/common/pagination";
import type { ShowcaseKind, ShowcaseRef } from "@repo/core/domain/common/refs";
import {
  type ArticleSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { LISTING_NOT_FOUND } from "./viewListing";
import { OCCASION_NOT_FOUND } from "./viewOccasion";
import { PLACE_NOT_FOUND } from "./viewPlace";
import { REGION_NOT_FOUND } from "./viewRegion";
import { articleSummaryPhotoIds, type PhotoRefs, photoRefsOf } from "./views";

export type ListArticlesShowcasingInput = Readonly<{
  /** The listing, place, region or occasion the articles showcase. */
  target: ShowcaseRef;
  pagination: Pagination;
}>;

export type ListArticlesShowcasingOutput = Readonly<{
  /** Newest first (first publication, then id). */
  items: readonly ArticleSummary[];
  count: number;
  photos: PhotoRefs;
}>;

/** The detail's not-found code for each kind of showcased target. */
const NOT_FOUND: Readonly<Record<ShowcaseKind, string>> = {
  listing: LISTING_NOT_FOUND,
  place: PLACE_NOT_FOUND,
  region: REGION_NOT_FOUND,
  occasion: OCCASION_NOT_FOUND,
};

/**
 * The 読みもの section of DT-01〜DT-04 (read with the section's count as
 * `limit`) and its continuation (EXP-04, EXP-06, EXP-07, EXP-09, CF-05):
 * the published articles whose showcases hold the target itself — a
 * place's listing does not make an article showcase the place — newest
 * first. Needs no login.
 *
 * @throws NotFoundError `LISTING_NOT_FOUND`, `PLACE_NOT_FOUND`,
 *   `REGION_NOT_FOUND` or `OCCASION_NOT_FOUND` (by the target's kind) when
 *   the target is not viewable or missing.
 * @throws BusinessRuleError `COMMON_INVALID_INPUT` for a pagination out of
 *   bounds.
 */
export async function listArticlesShowcasing({
  container,
  input,
}: ServiceArgs<ListArticlesShowcasingInput>): Promise<ListArticlesShowcasingOutput> {
  const pagination = Pagination.create(input.pagination);
  const { target } = input;
  if (!(await container.referenceQueries.isViewable(target))) {
    throw new NotFoundError(
      NOT_FOUND[target.kind],
      "The showcased target is not viewable",
    );
  }
  const page = await container.detailQueries.findArticlesShowcasing(
    target,
    pagination,
  );
  const items = page.items.map(ViewProjection.articleSummary);
  return {
    items,
    count: page.count,
    photos: await photoRefsOf(container, items.flatMap(articleSummaryPhotoIds)),
  };
}
