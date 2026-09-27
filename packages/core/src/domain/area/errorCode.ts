/**
 * Area's `BusinessRuleError` codes (`AREA_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/area.ts`.
 */
export const AreaErrorCode = {
  InvalidPostalCode: "AREA_INVALID_POSTAL_CODE",
  InvalidPrefectureCode: "AREA_INVALID_PREFECTURE_CODE",
  InvalidMunicipalityCode: "AREA_INVALID_MUNICIPALITY_CODE",
  TownNotFound: "AREA_TOWN_NOT_FOUND",
} as const;

export type AreaErrorCode = (typeof AreaErrorCode)[keyof typeof AreaErrorCode];
