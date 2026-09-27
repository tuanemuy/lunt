/**
 * Listing's `BusinessRuleError` codes (`LISTING_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/listing.ts`. The shared-kernel
 * codes raised under the `LISTING` prefix (`LISTING_SUSPENDED`,
 * `LISTING_PUBLISH_CONDITION_UNMET`, `LISTING_ALREADY_SUSPENDED`,
 * `LISTING_NOT_SUSPENDED`, `LISTING_DUPLICATE_PHOTO`,
 * `LISTING_PHOTO_NOT_FOUND`) are `SubjectErrorCode<"LISTING">`.
 */
export const ListingErrorCode = {
  InvalidName: "LISTING_INVALID_NAME",
  InvalidDescription: "LISTING_INVALID_DESCRIPTION",
  InvalidCategoryName: "LISTING_INVALID_CATEGORY_NAME",
  InvalidFraming: "LISTING_INVALID_FRAMING",
  InvalidOfferingPeriod: "LISTING_INVALID_OFFERING_PERIOD",
  InvalidOpenDates: "LISTING_INVALID_OPEN_DATES",
  DuplicatePhotosMismatch: "LISTING_DUPLICATE_PHOTOS_MISMATCH",
  PatchPhotosUnavailable: "LISTING_PATCH_PHOTOS_UNAVAILABLE",
  NotPublished: "LISTING_NOT_PUBLISHED",
  AlreadyEnded: "LISTING_ALREADY_ENDED",
  NotManuallyEnded: "LISTING_NOT_MANUALLY_ENDED",
  CategoryNotAvailable: "LISTING_CATEGORY_NOT_AVAILABLE",
  CategoryCatalogEstablished: "LISTING_CATEGORY_CATALOG_ESTABLISHED",
  CategoryNameTaken: "LISTING_CATEGORY_NAME_TAKEN",
  CategoryIdTaken: "LISTING_CATEGORY_ID_TAKEN",
  CategoryNotFound: "LISTING_CATEGORY_NOT_FOUND",
  CategoryRetired: "LISTING_CATEGORY_RETIRED",
  CategoryLastOne: "LISTING_CATEGORY_LAST_ONE",
  CategorySuccessorInvalid: "LISTING_CATEGORY_SUCCESSOR_INVALID",
} as const;

export type ListingErrorCode =
  (typeof ListingErrorCode)[keyof typeof ListingErrorCode];
