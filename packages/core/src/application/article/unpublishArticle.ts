import {
  Article,
  type UnpublishedArticle,
} from "@repo/core/domain/article/article";
import type { ArticleId } from "@repo/core/domain/common/ids";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireArticle } from "./articles";

export type UnpublishArticleInput = Readonly<{ articleId: ArticleId }>;

/**
 * An editor unpublishes a published article (`byManager`, EDT-05). The
 * content and showcases stay; it can be edited and published again. The
 * request carries no version. No event.
 *
 * - `NotFoundError` `ARTICLE_NOT_FOUND`, judged before the role
 *   (`spec/domains/index.md` 「エラーの種類」).
 * - `ForbiddenError` without `edit_articles`, also when revoked before the
 *   commit (AC-75).
 * - `BusinessRuleError` `COMMON_PUBLICATION_INVALID_TRANSITION` when not
 *   published.
 * - `ConflictError` on a concurrent save, publication or unpublication.
 */
export async function unpublishArticle({
  container,
  actor,
  input,
}: ActorServiceArgs<UnpublishArticleInput>): Promise<UnpublishedArticle> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    const read = await requireArticle(ctx, input.articleId);
    await authorizeRole(ctx, actor, "edit_articles");
    const unpublished = Article.unpublish(read.entity, now);
    await ctx.articleRepository.save(unpublished, read.expectedVersion);
    return unpublished;
  });
}
