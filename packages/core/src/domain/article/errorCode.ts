/**
 * Article's `BusinessRuleError` codes (`ARTICLE_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/article.ts`.
 */
export const ArticleErrorCode = {} as const;

export type ArticleErrorCode =
  (typeof ArticleErrorCode)[keyof typeof ArticleErrorCode];
