/**
 * Area's `BusinessRuleError` codes (`AREA_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/area.ts`.
 */
export const AreaErrorCode = {} as const;

export type AreaErrorCode = (typeof AreaErrorCode)[keyof typeof AreaErrorCode];
