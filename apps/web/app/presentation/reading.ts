import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { PAGINATION_MAX_PAGE } from "./pagination";
import {
  type ArticleDetailData,
  type ArticlesPage,
  SHOWCASE_KINDS,
} from "./readingView";
import { validateInput } from "./validator";

const idField = z.string().trim().min(1).max(128);

/** VW-09: a page of the published articles (CF-05). */
export const listArticlesFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      z.object({ page: z.number().int().min(1).max(PAGINATION_MAX_PAGE) }),
    ),
  )
  .handler(async ({ data }): Promise<ArticlesPage> => {
    const { loadArticlesPage } = await import("./readingData");
    return loadArticlesPage(data.page);
  });

/**
 * DT-05: the article as viewers read it. `NotFoundError`
 * (`ARTICLE_NOT_FOUND`) when it is a draft, unpublished or missing — the
 * route answers CS-06 with HTTP 404 (`orNotFound`).
 */
export const loadArticleDetailFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ articleId: idField })))
  .handler(async ({ data }): Promise<ArticleDetailData> => {
    const { loadArticleDetail } = await import("./readingData");
    return loadArticleDetail(data.articleId);
  });

export const showcasingPageSchema = z.object({
  target: z.object({ kind: z.enum(SHOWCASE_KINDS), id: idField }),
  page: z.number().int().min(2).max(PAGINATION_MAX_PAGE),
});

/**
 * The 読みもの section of DT-01〜DT-04, continued (CF-05). `NotFoundError`
 * when the detail's target stopped being viewable meanwhile (the screen
 * then shows CS-06).
 */
export const listArticlesShowcasingFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(showcasingPageSchema))
  .handler(async ({ data }): Promise<ArticlesPage> => {
    const { loadShowcasingPage } = await import("./readingData");
    return loadShowcasingPage(data.target, data.page);
  });
