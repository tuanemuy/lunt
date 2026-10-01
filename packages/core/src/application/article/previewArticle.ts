import {
  Article,
  type ArticleStatus,
  type PublicationRequirement,
} from "@repo/core/domain/article/article";
import type { ArticleId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import type { Version } from "@repo/core/domain/common/version";
import {
  type ArticlePreview,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { authorizeRole } from "../authority/access";
import {
  type PhotoRefs,
  photoRefsOf,
  showcaseSummaryPhotoIds,
  todayOf,
} from "../discovery/views";
import type { ActorServiceArgs } from "../types";
import { requireArticle, resolveShowcases } from "./articles";

export type PreviewArticleInput = Readonly<{ articleId: ArticleId }>;

export type PreviewArticleOutput = Readonly<{
  /**
   * How viewers would see the stored content: as a list / feed item
   * (`summary`) and as the article page (`detail`). `detail.showcases`
   * keeps every showcase in order, those viewers cannot see marked
   * `viewable: false` (the published page leaves them out).
   */
  preview: ArticlePreview;
  /** The showcases viewers cannot see, in the article's order; empty when all are shown. */
  hiddenShowcases: readonly ShowcaseRef[];
  /** In `title`, `photos`, `body` order; empty when publishable. */
  missingRequirements: readonly PublicationRequirement[];
  /** The current state — `published` when another editor published it meanwhile. */
  status: ArticleStatus;
  /** The stored article's version: the one `publishArticle` answered tells it has not changed since. */
  version: Version;
  /** Display refs of the article's photos and the viewable showcases' covers. */
  photos: PhotoRefs;
}>;

/**
 * CM-03 (EDT-03): the stored content of an article as viewers would see
 * it, and the publish requirements it lacks — also for incomplete
 * content, and without error for an article published meanwhile. Changes
 * nothing.
 *
 * - `NotFoundError` `ARTICLE_NOT_FOUND`, judged before the role
 *   (`spec/domains/index.md` 「エラーの種類」).
 * - `ForbiddenError` without `edit_articles`.
 */
export async function previewArticle({
  container,
  actor,
  input,
}: ActorServiceArgs<PreviewArticleInput>): Promise<PreviewArticleOutput> {
  const article = await container.unitOfWorkProvider.run(async (ctx) => {
    const read = await requireArticle(ctx, input.articleId);
    await authorizeRole(ctx, actor, "edit_articles");
    return read.entity;
  });
  const resolutions = await resolveShowcases(
    container,
    article.content.showcases,
  );
  const today = todayOf(container);
  const preview = ViewProjection.previewArticle(
    article.content,
    resolutions,
    today,
  );
  return {
    preview,
    hiddenShowcases: resolutions.flatMap((resolution) =>
      resolution.viewable ? [] : [resolution.ref],
    ),
    missingRequirements: Article.missingRequirements(article.content),
    status: article.publication.status,
    version: article.version,
    photos: await photoRefsOf(container, [
      ...PhotoSet.photoIds(article.content.photos),
      ...preview.detail.showcases.flatMap((showcase) =>
        showcase.viewable ? showcaseSummaryPhotoIds(showcase.showcase) : [],
      ),
    ]),
  };
}
