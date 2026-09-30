import type { Article, ArticleStatus } from "@repo/core/domain/article/article";
import { Pagination } from "@repo/core/domain/common/pagination";
import { authorizeRole } from "../authority/access";
import { type PhotoRefs, photoRefsOf } from "../discovery/views";
import { coverIdOf } from "../place/photos";
import type { ActorServiceArgs } from "../types";

export type ListArticlesForEditingInput = Readonly<{
  /** `null` lists every state. */
  status: ArticleStatus | null;
  pagination: Pagination;
}>;

export type ListArticlesForEditingOutput = Readonly<{
  /**
   * Newest `updatedAt` first, then id. Each tells its `publication` (with
   * the `reason` while unpublished) and whether a takedown removed photos
   * (`content.photos.takenDown`).
   */
  items: readonly Article[];
  count: number;
  /** Display refs of each item's cover (its first photo). */
  photos: PhotoRefs;
}>;

/**
 * AM-01: every editor's articles, filtered by state, most recently
 * changed first (EDT-01, EDT-03, EDT-04, EDT-05).
 *
 * - `ForbiddenError` without `edit_articles`.
 * - `BusinessRuleError` `COMMON_INVALID_INPUT` for a pagination out of
 *   bounds.
 */
export async function listArticlesForEditing({
  container,
  actor,
  input,
}: ActorServiceArgs<ListArticlesForEditingInput>): Promise<ListArticlesForEditingOutput> {
  const pagination = Pagination.create(input.pagination);
  const page = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "edit_articles");
    return ctx.articleRepository.findPage({ status: input.status }, pagination);
  });
  return {
    items: page.items,
    count: page.count,
    photos: await photoRefsOf(
      container,
      page.items.flatMap((article) => {
        const cover = coverIdOf(article.content.photos);
        return cover === null ? [] : [cover];
      }),
    ),
  };
}
