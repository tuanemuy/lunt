/**
 * Place's `BusinessRuleError` codes (`PLACE_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/place.ts`.
 */
export const PlaceErrorCode = {} as const;

export type PlaceErrorCode =
  (typeof PlaceErrorCode)[keyof typeof PlaceErrorCode];
