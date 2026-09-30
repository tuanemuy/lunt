import type { ArticleId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { authorizeRole } from "../authority/access";
import { type PhotoRefs, photoRefsOf, todayOf } from "../discovery/views";
import type { ActorServiceArgs } from "../types";
import {
  type ArticleWithRequirements,
  requireArticle,
  resolveShowcases,
  type ShowcaseState,
  showcasePhotoIds,
  showcaseStates,
  withRequirements,
} from "./articles";

export type GetArticleForEditingInput = Readonly<{ articleId: ArticleId }>;

export type ArticleForEditing = ArticleWithRequirements &
  Readonly<{
    /** Whether a takedown claim removed photos since the last change of photos. */
    photosTakenDown: boolean;
    /**
     * Every showcase in the article's order: a viewable one with its
     * summary and standing (reference scene); one viewers cannot see with
     * what is still stored of it (its name, or that it no longer exists) —
     * the link stays until an editor removes it.
     */
    showcases: readonly ShowcaseState[];
    /** Display refs of the article's photos and the viewable showcases' covers. */
    photos: PhotoRefs;
  }>;

/**
 * AM-02: one article for editing, whoever created it (EDT-02, EDT-04,
 * EDT-06, MOD-03) — its content, publication (with the reason), version
 * (the input of `reviseArticle`), whether a takedown removed photos, and
 * each showcase's current state.
 *
 * - `NotFoundError` `ARTICLE_NOT_FOUND`, judged before the role
 *   (`spec/domains/index.md` 「エラーの種類」).
 * - `ForbiddenError` without `edit_articles`.
 */
export async function getArticleForEditing({
  container,
  actor,
  input,
}: ActorServiceArgs<GetArticleForEditingInput>): Promise<ArticleForEditing> {
  const article = await container.unitOfWorkProvider.run(async (ctx) => {
    const read = await requireArticle(ctx, input.articleId);
    await authorizeRole(ctx, actor, "edit_articles");
    return read.entity;
  });
  const showcases = await showcaseStates(
    container,
    await resolveShowcases(container, article.content.showcases),
    todayOf(container),
  );
  return {
    ...withRequirements(article),
    photosTakenDown: article.content.photos.takenDown,
    showcases,
    photos: await photoRefsOf(container, [
      ...PhotoSet.photoIds(article.content.photos),
      ...showcasePhotoIds(showcases),
    ]),
  };
}
