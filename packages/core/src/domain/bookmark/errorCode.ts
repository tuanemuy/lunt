/**
 * Bookmark's `BusinessRuleError` codes (`BOOKMARK_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/bookmark.ts`.
 */
export const BookmarkErrorCode = {} as const;

export type BookmarkErrorCode =
  (typeof BookmarkErrorCode)[keyof typeof BookmarkErrorCode];
