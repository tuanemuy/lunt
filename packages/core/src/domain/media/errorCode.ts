/**
 * Media's `BusinessRuleError` codes (`MEDIA_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/media.ts`.
 */
export const MediaErrorCode = {
  /** The registrant did not agree to the rights and use of the photo. */
  InvalidConsent: "MEDIA_INVALID_CONSENT",
  InvalidFormat: "MEDIA_INVALID_FORMAT",
  /** The file cannot be read as a still image (video, broken, not an image). */
  NotAPhoto: "MEDIA_NOT_A_PHOTO",
  InvalidPolicy: "MEDIA_INVALID_POLICY",
  /** A duplicate's source has no record or is not `stored`. */
  DuplicateSourceUnavailable: "MEDIA_DUPLICATE_SOURCE_UNAVAILABLE",
  /** The photo does not exist, was deleted, or is not `stored`. */
  PhotoNotAvailable: "MEDIA_PHOTO_NOT_AVAILABLE",
  PhotoAlreadyOwned: "MEDIA_PHOTO_ALREADY_OWNED",
  /** Only the account that registered (or duplicated) a photo may claim it. */
  PhotoNotRegistrant: "MEDIA_PHOTO_NOT_REGISTRANT",
  /** A transfer's `from` is not the photo's current owner. */
  PhotoOwnerMismatch: "MEDIA_PHOTO_OWNER_MISMATCH",
} as const;

export type MediaErrorCode =
  (typeof MediaErrorCode)[keyof typeof MediaErrorCode];
