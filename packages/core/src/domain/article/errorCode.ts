/**
 * Article's `BusinessRuleError` codes (`ARTICLE_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/article.ts`. The shared kernel
 * raises `ARTICLE_PUBLISH_CONDITION_UNMET`, `ARTICLE_DUPLICATE_PHOTO` and
 * `ARTICLE_PHOTO_NOT_FOUND` under Article's prefix
 * (`SubjectErrorCode<"ARTICLE">`); those are presented by the common
 * catalog.
 */
export const ArticleErrorCode = {
  InvalidTitle: "ARTICLE_INVALID_TITLE",
  InvalidBody: "ARTICLE_INVALID_BODY",
  InvalidShowcaseList: "ARTICLE_INVALID_SHOWCASE_LIST",
} as const;

export type ArticleErrorCode =
  (typeof ArticleErrorCode)[keyof typeof ArticleErrorCode];
