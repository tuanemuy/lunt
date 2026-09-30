import {
  Article,
  type PublicationRequirement,
} from "@repo/core/domain/article/article";
import type { ArticleRepositories } from "@repo/core/domain/article/ports/unitOfWork";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { ArticleId } from "@repo/core/domain/common/ids";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import type { Version } from "@repo/core/domain/common/version";
import type { ReferenceResolution } from "@repo/core/domain/discovery/entry";
import type { RequestContainer } from "../di/types";
import { ConflictError, NotFoundError } from "../errors";

export const ARTICLE_NOT_FOUND = "ARTICLE_NOT_FOUND";
/** The id is already used by an article with other content. */
export const ARTICLE_ID_CONFLICT = "ARTICLE_ID_CONFLICT";
/** The edit started from a version someone else has saved over since. */
export const ARTICLE_VERSION_CONFLICT = "ARTICLE_VERSION_CONFLICT";

/** The article with its version token; `NotFoundError` when there is none. */
export async function requireArticle(
  ctx: ArticleRepositories,
  id: ArticleId,
): Promise<Versioned<Article>> {
  const found = await ctx.articleRepository.findById(id);
  if (found === null) {
    throw new NotFoundError(ARTICLE_NOT_FOUND, `Article ${id} does not exist`);
  }
  return found;
}

/**
 * 編集の競合: the version the edit started from must still be the stored
 * one, or someone else's save, publication or a takedown would be
 * overwritten.
 */
export function assertEditedVersion(article: Article, edited: Version): void {
  if (article.version !== edited) {
    throw new ConflictError(
      ARTICLE_VERSION_CONFLICT,
      `Article ${article.id} changed since version ${edited} was read`,
    );
  }
}

/** An article with the publish requirements its content lacks. */
export type ArticleWithRequirements = Readonly<{
  article: Article;
  /** In `title`, `photos`, `body` order; empty when publishable. */
  missingRequirements: readonly PublicationRequirement[];
}>;

export const withRequirements = (
  article: Article,
): ArticleWithRequirements => ({
  article,
  missingRequirements: Article.missingRequirements(article.content),
});

/**
 * `ReferenceQueries.resolve` over every showcase, in the article's order,
 * 100 per call. Called outside the unit of work.
 */
export async function resolveShowcases(
  container: Pick<RequestContainer, "referenceQueries">,
  showcases: readonly ShowcaseRef[],
): Promise<readonly ReferenceResolution[]> {
  const resolved: ReferenceResolution[] = [];
  for (const refs of IdBatch.chunks(showcases)) {
    resolved.push(...(await container.referenceQueries.resolve(refs)));
  }
  return resolved;
}
