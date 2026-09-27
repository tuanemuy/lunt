/**
 * Place's `BusinessRuleError` codes (`PLACE_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/place.ts`. The shared kernel
 * raises `PLACE_ALREADY_SUSPENDED`, `PLACE_NOT_SUSPENDED`,
 * `PLACE_DUPLICATE_PHOTO` and `PLACE_PHOTO_NOT_FOUND` under Place's prefix
 * (`SubjectErrorCode`); those are presented by the common catalog.
 */
export const PlaceErrorCode = {
  InvalidOperatingStatus: "PLACE_INVALID_OPERATING_STATUS",
  InvalidName: "PLACE_INVALID_NAME",
  InvalidDescription: "PLACE_INVALID_DESCRIPTION",
  InvalidBusinessHours: "PLACE_INVALID_BUSINESS_HOURS",
  InvalidContactInfo: "PLACE_INVALID_CONTACT_INFO",
  InvalidMatchText: "PLACE_INVALID_MATCH_TEXT",
  InvalidMatchCriteria: "PLACE_INVALID_MATCH_CRITERIA",
} as const;

export type PlaceErrorCode =
  (typeof PlaceErrorCode)[keyof typeof PlaceErrorCode];
