/**
 * Region's `BusinessRuleError` codes (`REGION_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/region.ts`. The shared kernel
 * raises `REGION_SUSPENDED`, `REGION_PUBLISH_CONDITION_UNMET`,
 * `REGION_ALREADY_SUSPENDED`, `REGION_NOT_SUSPENDED`,
 * `REGION_DUPLICATE_PHOTO` and `REGION_PHOTO_NOT_FOUND` under Region's
 * prefix (`SubjectErrorCode<"REGION">`); those are presented by the common
 * catalog.
 */
export const RegionErrorCode = {
  InvalidName: "REGION_INVALID_NAME",
  InvalidDescription: "REGION_INVALID_DESCRIPTION",
  AlreadyAffiliated: "REGION_ALREADY_AFFILIATED",
  NotAffiliated: "REGION_NOT_AFFILIATED",
  RepresentativeAlreadyChosen: "REGION_REPRESENTATIVE_ALREADY_CHOSEN",
} as const;

export type RegionErrorCode =
  (typeof RegionErrorCode)[keyof typeof RegionErrorCode];
