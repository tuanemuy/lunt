// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { getContainer } from "@repo/core/application/di/containerStore";
import { listArticles } from "@repo/core/application/discovery/listArticles";
import { listArticlesShowcasing } from "@repo/core/application/discovery/listArticlesShowcasing";
import { readArticle } from "@repo/core/application/discovery/readArticle";
import { todayOf } from "@repo/core/application/discovery/views";
import { NotFoundError } from "@repo/core/application/errors";
import { ArticleId } from "@repo/core/domain/common/ids";
import { ShowcaseRef } from "@repo/core/domain/common/refs";
import {
  ARTICLE_SECTION_PAGE_SIZE,
  ARTICLES_PAGE_SIZE,
  type ArticleScreen,
  type ArticlesPage,
  type ShowcaseTarget,
  toArticleDetailData,
  toArticlesPage,
} from "./readingView";

/** A page of VW-09: the published articles, newest first. */
export async function loadArticlesPage(page: number): Promise<ArticlesPage> {
  const container = await getContainer();
  const output = await listArticles({
    container,
    input: { pagination: { page, limit: ARTICLES_PAGE_SIZE } },
  });
  return toArticlesPage(output);
}

/**
 * DT-05's screen. An article that is a draft, unpublished or missing is
 * CS-06, told apart here because an error thrown inside the streamed
 * render reaches the browser redacted.
 */
export async function loadArticleScreen(
  articleId: string,
): Promise<ArticleScreen> {
  const container = await getContainer();
  try {
    const output = await readArticle({
      container,
      input: { articleId: ArticleId.create(articleId) },
    });
    return {
      kind: "ready",
      article: toArticleDetailData(output, todayOf(container)),
    };
  } catch (error) {
    if (error instanceof NotFoundError) return { kind: "unavailable" };
    throw error;
  }
}

/**
 * A page of the 読みもの section of the detail of `target`.
 * `NotFoundError` (the detail's not-found code) when the target is not
 * viewable: the detail then shows CS-06.
 */
export async function loadShowcasingPage(
  target: ShowcaseTarget,
  page: number,
): Promise<ArticlesPage> {
  const container = await getContainer();
  const output = await listArticlesShowcasing({
    container,
    input: {
      target: ShowcaseRef.create(target.kind, target.id),
      pagination: { page, limit: ARTICLE_SECTION_PAGE_SIZE },
    },
  });
  return toArticlesPage(output);
}
