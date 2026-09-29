/**
 * Occasion's `BusinessRuleError` codes (`OCCASION_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/occasion.ts`.
 */
export const OccasionErrorCode = {} as const;

export type OccasionErrorCode =
  (typeof OccasionErrorCode)[keyof typeof OccasionErrorCode];
