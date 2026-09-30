import type { ArticleId, PhotoId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import type { ReferenceResolution } from "@repo/core/domain/discovery/entry";
import {
  type ShowcasePreview,
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
import {
  type ArticleWithRequirements,
  requireArticle,
  resolveShowcases,
  withRequirements,
} from "./articles";

export type GetArticleForEditingInput = Readonly<{ articleId: ArticleId }>;

export type ArticleForEditing = ArticleWithRequirements &
  Readonly<{
    /** Whether a takedown claim removed photos since the last change of photos. */
    photosTakenDown: boolean;
    /**
     * Every showcase in the article's order: a viewable one with its
     * summary and standing (reference scene), one viewers cannot see only
     * as such — the link stays until an editor removes it.
     */
    showcases: readonly ShowcasePreview[];
    /** Display refs of the article's photos and the showcases' covers. */
    photos: PhotoRefs;
  }>;

/** Each resolution as an editing / preview showcase, in order. */
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

export const showcasePhotoIds = (
  showcases: readonly ShowcasePreview[],
): readonly PhotoId[] =>
  showcases.flatMap((showcase) =>
    showcase.viewable ? showcaseSummaryPhotoIds(showcase.showcase) : [],
  );

/**
 * AM-02: one article for editing, whoever created it (EDT-02, EDT-04,
 * EDT-06, MOD-03) — its content, publication (with the reason), version
 * (the input of `reviseArticle`), whether a takedown removed photos, and
 * each showcase's current state.
 *
 * - `ForbiddenError` without `edit_articles`.
 * - `NotFoundError` `ARTICLE_NOT_FOUND`.
 */
export async function getArticleForEditing({
  container,
  actor,
  input,
}: ActorServiceArgs<GetArticleForEditingInput>): Promise<ArticleForEditing> {
  const article = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "edit_articles");
    return (await requireArticle(ctx, input.articleId)).entity;
  });
  const showcases = showcaseStates(
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
