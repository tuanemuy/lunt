/**
 * Region's `BusinessRuleError` codes (`REGION_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/region.ts`.
 */
export const RegionErrorCode = {} as const;

export type RegionErrorCode =
  (typeof RegionErrorCode)[keyof typeof RegionErrorCode];
