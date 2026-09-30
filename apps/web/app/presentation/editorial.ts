import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ARTICLE_STATUSES,
  type ArticleRow,
  type ArticleStatusValue,
  SHOWCASE_KINDS,
  type ShowcaseCandidates,
} from "./editorialView";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { paginationSchema } from "./pagination";
import type { ListPage } from "./regionView";
import { validateInput } from "./validator";

/*
 * AM-01, AM-02 and CM-03 of an article: the transport schemas and server
 * functions. Server-only reads live in `editorialData.ts`.
 */

const idField = z.string().min(1).max(64);

export const articleRefSchema = z.object({ articleId: idField });

/**
 * `beforeLoad` check of the editorial area (AM, CM-03 of an article): the
 * logged-in account must hold the editor role, else `ForbiddenError`
 * (CS-05).
 */
export const requireEditorFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { requireEditor } = await import("./editorialData");
    await requireEditor();
    return null;
  });

export const editorialSearchSchema = z.object({
  /** A state's section to open at (AM-01 `?status=`). */
  status: z.enum(ARTICLE_STATUSES).optional().catch(undefined),
});

/** AM-01: a further page of one state's articles (CF-05). */
export const listEditorialArticlesFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      paginationSchema.extend({ status: z.enum(ARTICLE_STATUSES) }),
    ),
  )
  .handler(async ({ data }): Promise<ListPage<ArticleRow>> => {
    const { loadArticleRows } = await import("./editorialData");
    return loadArticleRows(data.status, {
      page: data.page,
      limit: data.limit,
    });
  });

export const articleContentSchema = z.object({
  title: z.string().max(1000, "タイトルは100文字以内で入力してください"),
  body: z.string().max(40_000, "本文は20000文字以内で入力してください"),
  photoIds: z.array(idField).max(100, "写真は100枚までです"),
  showcases: z
    .array(z.object({ kind: z.enum(SHOWCASE_KINDS), id: idField }))
    .max(100, "紹介先は100件までです"),
});

export type ArticleContentInput = z.infer<typeof articleContentSchema>;

/** AM-02 新規: creates the article as a draft (EDT-01), idempotent on the id. */
export const createArticleFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      z.object({ articleId: idField, content: articleContentSchema }),
    ),
  )
  .handler(async ({ data }) => {
    const { createArticleAsEditor } = await import("./editorialData");
    return createArticleAsEditor(data.articleId, data.content);
  });

/** AM-02: saves the whole content from the version the edit started from. */
export const reviseArticleFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      z.object({
        articleId: idField,
        version: z.number().int().min(0),
        content: articleContentSchema,
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { reviseArticleAsEditor } = await import("./editorialData");
    return reviseArticleAsEditor(data.articleId, data.version, data.content);
  });

export const ARTICLE_PUBLICATION_CHANGES = ["publish", "unpublish"] as const;
export type ArticlePublicationChange =
  (typeof ARTICLE_PUBLICATION_CHANGES)[number];

/** AM-02 and CM-03 (CF-08): publishes, or unpublishes (公開の取り下げ). */
export const changeArticlePublicationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      articleRefSchema.extend({
        change: z.enum(ARTICLE_PUBLICATION_CHANGES),
      }),
    ),
  )
  .handler(
    async ({
      data,
    }): Promise<Readonly<{ version: number; status: ArticleStatusValue }>> => {
      const { changeArticlePublication } = await import("./editorialData");
      return changeArticlePublication(data.articleId, data.change);
    },
  );

/**
 * AM-02 CF-02: listings, places, regions and events viewers can see that
 * match. Editors only (CS-05), like the screen it serves.
 */
export const findShowcaseCandidatesFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ keyword: z.string().max(200) })))
  .handler(async ({ data }): Promise<ShowcaseCandidates> => {
    const { findShowcaseCandidates } = await import("./editorialData");
    return findShowcaseCandidates(data.keyword);
  });
