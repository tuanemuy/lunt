/**
 * Media's `BusinessRuleError` codes (`MEDIA_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/media.ts`.
 */
export const MediaErrorCode = {} as const;

export type MediaErrorCode =
  (typeof MediaErrorCode)[keyof typeof MediaErrorCode];
