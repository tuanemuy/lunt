import {
  Article,
  type ArticleContentInput,
  type PublicationRequirement,
} from "@repo/core/domain/article/article";
import type { ArticleRepositories } from "@repo/core/domain/article/ports/unitOfWork";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { ArticleId, PhotoId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import { type ShowcaseKind, ShowcaseRef } from "@repo/core/domain/common/refs";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import type { Version } from "@repo/core/domain/common/version";
import type { ReferenceResolution } from "@repo/core/domain/discovery/entry";
import {
  type ShowcasePreview,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import type { RequestContainer } from "../di/types";
import { showcaseSummaryPhotoIds } from "../discovery/views";
import { ConflictError, NotFoundError } from "../errors";
import type { GeneratedId } from "../ports/idGenerator";

export const ARTICLE_NOT_FOUND = "ARTICLE_NOT_FOUND";
/** The id is already used by an article with other content. */
export const ARTICLE_ID_CONFLICT = "ARTICLE_ID_CONFLICT";
/** The edit started from a version someone else has saved over since. */
export const ARTICLE_VERSION_CONFLICT = "ARTICLE_VERSION_CONFLICT";

/**
 * A showcased target as the caller names it. The id is a `GeneratedId`, so
 * the transport has to parse it (`parseGeneratedId`) and an id the store
 * would refuse to read back cannot be saved.
 */
export type ShowcaseInput = Readonly<{ kind: ShowcaseKind; id: GeneratedId }>;

/**
 * An article's whole content as entered (`createArticle`, `reviseArticle`).
 * Blank title / body are "not entered"; photos (the first is the cover) and
 * showcases in display order.
 */
export type ArticleContentFields = Readonly<{
  title: string;
  body: string;
  photoIds: readonly PhotoId[];
  showcases: readonly ShowcaseInput[];
}>;

/** `fields` as the domain's input, each showcase as its kind's ref. */
export const contentInputOf = (
  fields: ArticleContentFields,
): ArticleContentInput => ({
  title: fields.title,
  body: fields.body,
  photoIds: fields.photoIds,
  showcases: fields.showcases.map((showcase) =>
    ShowcaseRef.create(showcase.kind, showcase.id),
  ),
});

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

/**
 * Each resolution, in order: a viewable showcase with its summary and
 * standing (reference scene); one viewers cannot see only as such — it
 * carries no information about its target (`spec/usecases/article.md`
 * 「getArticleForEditing」).
 */
export function showcaseStates(
  resolutions: readonly ReferenceResolution[],
  today: LocalDate,
): readonly ShowcasePreview[] {
  return resolutions.map(
    (resolution): ShowcasePreview =>
      resolution.viewable
        ? {
            ref: resolution.ref,
            viewable: true,
            showcase: ViewProjection.showcaseSummary(resolution.target, today),
          }
        : { ref: resolution.ref, viewable: false },
  );
}

/** Photo ids of the viewable showcases' summaries. */
export const showcasePhotoIds = (
  showcases: readonly ShowcasePreview[],
): readonly PhotoId[] =>
  showcases.flatMap((showcase) =>
    showcase.viewable ? showcaseSummaryPhotoIds(showcase.showcase) : [],
  );
