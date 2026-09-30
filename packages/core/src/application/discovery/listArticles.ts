import { Pagination } from "@repo/core/domain/common/pagination";
import {
  type ArticleSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import type { ServiceArgs } from "../types";
import { articleSummaryPhotoIds, type PhotoRefs, photoRefsOf } from "./views";

export type ListArticlesInput = Readonly<{ pagination: Pagination }>;

export type ListArticlesOutput = Readonly<{
  /** Newest first (first publication, then id). */
  items: readonly ArticleSummary[];
  count: number;
  photos: PhotoRefs;
}>;

/**
 * VW-09 (EXP-11): the published articles, newest first by their first
 * publication (re-publishing does not move one up). No browse criteria
 * apply; articles have no standing. Needs no login.
 *
 * @throws BusinessRuleError `COMMON_INVALID_INPUT` for a pagination out of
 *   bounds.
 */
export async function listArticles({
  container,
  input,
}: ServiceArgs<ListArticlesInput>): Promise<ListArticlesOutput> {
  const pagination = Pagination.create(input.pagination);
  const page = await container.explorationQueries.findArticles(pagination);
  const items = page.items.map(ViewProjection.articleSummary);
  return {
    items,
    count: page.count,
    photos: await photoRefsOf(container, items.flatMap(articleSummaryPhotoIds)),
  };
}
