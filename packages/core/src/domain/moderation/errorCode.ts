/**
 * Moderation's `BusinessRuleError` codes (`MODERATION_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/moderation.ts`.
 */
export const ModerationErrorCode = {} as const;

export type ModerationErrorCode =
  (typeof ModerationErrorCode)[keyof typeof ModerationErrorCode];
