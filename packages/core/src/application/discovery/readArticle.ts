import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { ArticleId, PhotoId } from "@repo/core/domain/common/ids";
import type { ResolvedTarget } from "@repo/core/domain/discovery/entry";
import {
  type ArticleDetail,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import {
  type PhotoRefs,
  photoRefsOf,
  showcaseSummaryPhotoIds,
  todayOf,
} from "./views";

export const ARTICLE_NOT_FOUND = "ARTICLE_NOT_FOUND";

export type ReadArticleInput = Readonly<{ articleId: ArticleId }>;

export type ReadArticleOutput = Readonly<{
  article: ArticleDetail;
  photos: PhotoRefs;
}>;

const photoIdsOf = (article: ArticleDetail): readonly PhotoId[] => [
  ...article.photos.map((photo) => photo.photoId),
  ...article.showcases.flatMap(showcaseSummaryPhotoIds),
];

/**
 * DT-05 (EXP-12): a published article — title, photos in registration
 * order, body — and its showcased targets in the editor's order, each as a
 * summary telling its kind and carrying its id. Showcases are in the
 * reference scene (upcoming or ended listings, closed places, ended or
 * cancelled occasions shown with their standing); those not viewable
 * (suspended, unpublished, deleted, or a listing of a suspended place)
 * are left out without changing the body. Needs no login.
 *
 * @throws NotFoundError `ARTICLE_NOT_FOUND` when the article is a draft,
 *   unpublished or missing (not told apart).
 */
export async function readArticle({
  container,
  input,
}: ServiceArgs<ReadArticleInput>): Promise<ReadArticleOutput> {
  const found = await container.detailQueries.findArticle(input.articleId);
  if (found === null) {
    throw new NotFoundError(ARTICLE_NOT_FOUND, "The article is not viewable");
  }
  const today = todayOf(container);
  const showcases: ResolvedTarget[] = [];
  for (const refs of IdBatch.chunks(found.content.showcases)) {
    for (const resolution of await container.referenceQueries.resolve(refs)) {
      if (resolution.viewable) showcases.push(resolution.target);
    }
  }
  const article = ViewProjection.articleDetail(found, showcases, today);
  return {
    article,
    photos: await photoRefsOf(container, photoIdsOf(article)),
  };
}
