import { Article } from "@repo/core/domain/article/article";
import type { ArticleId } from "@repo/core/domain/common/ids";
import type { Version } from "@repo/core/domain/common/version";
import { authorizeRole } from "../authority/access";
import { claimNewPhotos } from "../place/photos";
import type { ActorServiceArgs } from "../types";
import {
  type ArticleContentFields,
  type ArticleWithRequirements,
  assertEditedVersion,
  contentInputOf,
  requireArticle,
  withRequirements,
} from "./articles";

export type ReviseArticleInput = Readonly<{
  articleId: ArticleId;
  /** The version the edit started from (`getArticleForEditing`). */
  version: Version;
  /** The whole content; photos kept and newly added, and showcases, in display order. */
  content: ArticleContentFields;
}>;

/**
 * An editor replaces an article's whole content (EDT-02, EDT-04, EDT-06,
 * MOD-03). The publication does not change — adding photos does not
 * re-publish an article unpublished by a takedown. A published article
 * must keep its publish condition; a draft or an unpublished one is not
 * checked. Newly added photos become the article's; dropped ones are
 * released (`photos.released`). Unchanged content writes nothing.
 *
 * - `NotFoundError` `ARTICLE_NOT_FOUND`, judged before the role
 *   (`spec/domains/index.md` 「エラーの種類」).
 * - `ForbiddenError` without `edit_articles`, also when revoked before the
 *   commit (AC-75).
 * - `ConflictError` when `version` is not the stored one (judged after the
 *   content's own errors, 「編集の競合」), or on an
 *   optimistic-lock conflict of the article or a photo.
 * - `BusinessRuleError` `ARTICLE_PUBLISH_CONDITION_UNMET` (with the missing
 *   requirements), `ARTICLE_INVALID_*`, `ARTICLE_DUPLICATE_PHOTO`,
 *   `MEDIA_PHOTO_*`.
 */
export async function reviseArticle({
  container,
  actor,
  input,
}: ActorServiceArgs<ReviseArticleInput>): Promise<ArticleWithRequirements> {
  const now = container.clock.now();
  const article = await container.unitOfWorkProvider.run(async (ctx) => {
    const read = await requireArticle(ctx, input.articleId);
    await authorizeRole(ctx, actor, "edit_articles");
    const { entity, eventDrafts, addedPhotoIds } = Article.revise(
      read.entity,
      contentInputOf(input.content),
      now,
    );
    assertEditedVersion(read.entity, input.version);
    if (entity === read.entity) return entity;
    await claimNewPhotos(ctx, addedPhotoIds, Article.ref(entity), actor);
    await ctx.articleRepository.save(entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
  return withRequirements(article);
}
