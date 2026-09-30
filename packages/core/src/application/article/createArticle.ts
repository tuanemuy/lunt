import { Article } from "@repo/core/domain/article/article";
import { ArticleId } from "@repo/core/domain/common/ids";
import { authorizeRole } from "../authority/access";
import { ConflictError } from "../errors";
import { claimNewPhotos } from "../place/photos";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import {
  ARTICLE_ID_CONFLICT,
  type ArticleContentFields,
  type ArticleWithRequirements,
  contentInputOf,
  withRequirements,
} from "./articles";

export type CreateArticleInput = Readonly<{
  /** Minted by the caller and resent unchanged on failure. */
  articleId: GeneratedId;
  content: ArticleContentFields;
}>;

/**
 * An editor creates an article as a draft (EDT-01, EDT-02), publish
 * condition unchecked; showcases need neither exist nor be viewable, and
 * nobody is asked or notified. The photos become the article's. No event.
 *
 * Idempotent create: the same id with `Article.sameContent` returns the
 * stored article without writing; other content is a `ConflictError`.
 *
 * - `ForbiddenError` without `edit_articles`, also when the role is
 *   revoked before the commit (AC-75).
 * - `BusinessRuleError` `ARTICLE_INVALID_TITLE`, `ARTICLE_INVALID_BODY`,
 *   `ARTICLE_DUPLICATE_PHOTO`, `ARTICLE_INVALID_SHOWCASE_LIST`,
 *   `MEDIA_PHOTO_NOT_AVAILABLE`, `MEDIA_PHOTO_NOT_REGISTRANT`,
 *   `MEDIA_PHOTO_ALREADY_OWNED`.
 * - `ConflictError` for the id conflict or a photo's optimistic lock.
 */
export async function createArticle({
  container,
  actor,
  input,
}: ActorServiceArgs<CreateArticleInput>): Promise<ArticleWithRequirements> {
  const id = ArticleId.create(input.articleId);
  const content = contentInputOf(input.content);
  const { entity, addedPhotoIds } = Article.create(
    { id, content },
    container.clock.now(),
  );
  const article = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "edit_articles");
    const found = await ctx.articleRepository.findById(id);
    if (found !== null) {
      if (Article.sameContent(found.entity, content)) {
        return found.entity;
      }
      throw new ConflictError(
        ARTICLE_ID_CONFLICT,
        `Article id ${id} is already used for another article`,
      );
    }
    await claimNewPhotos(ctx, addedPhotoIds, Article.ref(entity), actor);
    await ctx.articleRepository.insert(entity);
    return entity;
  });
  return withRequirements(article);
}
