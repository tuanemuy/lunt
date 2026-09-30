import {
  Article,
  type PublishedArticle,
} from "@repo/core/domain/article/article";
import type { ArticleId } from "@repo/core/domain/common/ids";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireArticle } from "./articles";

export type PublishArticleInput = Readonly<{ articleId: ArticleId }>;

/**
 * An editor publishes a draft or an unpublished article as stored
 * (EDT-03, MOD-03) — including content another editor saved meanwhile; the
 * request carries no version. No approval, no event; the showcases are no
 * condition. `firstPublishedAt` survives re-publishing.
 *
 * - `ForbiddenError` without `edit_articles`, also when revoked before the
 *   commit (AC-75).
 * - `NotFoundError` `ARTICLE_NOT_FOUND`.
 * - `BusinessRuleError` `COMMON_PUBLICATION_INVALID_TRANSITION` when already
 *   published (checked first), `ARTICLE_PUBLISH_CONDITION_UNMET` with the
 *   missing requirements.
 * - `ConflictError` on a concurrent save, publication or unpublication.
 */
export async function publishArticle({
  container,
  actor,
  input,
}: ActorServiceArgs<PublishArticleInput>): Promise<PublishedArticle> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "edit_articles");
    const read = await requireArticle(ctx, input.articleId);
    const published = Article.publish(read.entity, now);
    await ctx.articleRepository.save(published, read.expectedVersion);
    return published;
  });
}
