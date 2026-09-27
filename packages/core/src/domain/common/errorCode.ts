import type {
  ExposureSubject,
  PublishableSubject,
} from "@repo/core/domain/common/exposureSubject";

/** `BusinessRuleError` codes owned by the shared kernel (`COMMON_` prefix). */
export const CommonErrorCode = {
  InvalidEmailAddress: "COMMON_INVALID_EMAIL_ADDRESS",
  InvalidAreaCode: "COMMON_INVALID_AREA_CODE",
  InvalidLocalDate: "COMMON_INVALID_LOCAL_DATE",
  InvalidDateRange: "COMMON_INVALID_DATE_RANGE",
  InvalidGeoPoint: "COMMON_INVALID_GEO_POINT",
  InvalidGeoBounds: "COMMON_INVALID_GEO_BOUNDS",
  InvalidTagline: "COMMON_INVALID_TAGLINE",
  InvalidSearchKeyword: "COMMON_INVALID_SEARCH_KEYWORD",
  InvalidFieldPatch: "COMMON_INVALID_FIELD_PATCH",
  PublicationInvalidTransition: "COMMON_PUBLICATION_INVALID_TRANSITION",
  InvalidInput: "COMMON_INVALID_INPUT",
  InvalidAccountId: "COMMON_INVALID_ACCOUNT_ID",
  InvalidPlaceId: "COMMON_INVALID_PLACE_ID",
  InvalidListingId: "COMMON_INVALID_LISTING_ID",
  InvalidCategoryId: "COMMON_INVALID_CATEGORY_ID",
  InvalidRegionId: "COMMON_INVALID_REGION_ID",
  InvalidOccasionId: "COMMON_INVALID_OCCASION_ID",
  InvalidArticleId: "COMMON_INVALID_ARTICLE_ID",
  InvalidApplicationId: "COMMON_INVALID_APPLICATION_ID",
  InvalidPhotoId: "COMMON_INVALID_PHOTO_ID",
  InvalidInvitationId: "COMMON_INVALID_INVITATION_ID",
  InvalidTakedownClaimId: "COMMON_INVALID_TAKEDOWN_CLAIM_ID",
  InvalidInfoReportId: "COMMON_INVALID_INFO_REPORT_ID",
  InvalidNotificationId: "COMMON_INVALID_NOTIFICATION_ID",
} as const;

export type CommonErrorCode =
  (typeof CommonErrorCode)[keyof typeof CommonErrorCode];

export type SuspendedCode<S extends ExposureSubject = ExposureSubject> =
  `${S}_SUSPENDED`;
export type PublishConditionUnmetCode<
  S extends PublishableSubject = PublishableSubject,
> = `${S}_PUBLISH_CONDITION_UNMET`;
export type AlreadySuspendedCode<S extends ExposureSubject = ExposureSubject> =
  `${S}_ALREADY_SUSPENDED`;
export type NotSuspendedCode<S extends ExposureSubject = ExposureSubject> =
  `${S}_NOT_SUSPENDED`;
export type DuplicatePhotoCode<S extends ExposureSubject = ExposureSubject> =
  `${S}_DUPLICATE_PHOTO`;
export type PhotoNotFoundCode<S extends ExposureSubject = ExposureSubject> =
  `${S}_PHOTO_NOT_FOUND`;

/**
 * Codes the shared kernel raises under the caller's domain prefix. They are
 * built from `ExposureSubject` so e.g. `SubjectErrorCode<"LISTING">` is exactly
 * the `LISTING_…` codes the Listing domain can observe from these functions.
 */
export type SubjectErrorCode<S extends ExposureSubject = ExposureSubject> =
  | SuspendedCode<S>
  | PublishConditionUnmetCode<Extract<S, PublishableSubject>>
  | AlreadySuspendedCode<S>
  | NotSuspendedCode<S>
  | DuplicatePhotoCode<S>
  | PhotoNotFoundCode<S>;

export const SubjectErrorCode = {
  suspended: <S extends ExposureSubject>(subject: S): SuspendedCode<S> =>
    `${subject}_SUSPENDED`,
  publishConditionUnmet: <S extends PublishableSubject>(
    subject: S,
  ): PublishConditionUnmetCode<S> => `${subject}_PUBLISH_CONDITION_UNMET`,
  alreadySuspended: <S extends ExposureSubject>(
    subject: S,
  ): AlreadySuspendedCode<S> => `${subject}_ALREADY_SUSPENDED`,
  notSuspended: <S extends ExposureSubject>(subject: S): NotSuspendedCode<S> =>
    `${subject}_NOT_SUSPENDED`,
  duplicatePhoto: <S extends ExposureSubject>(
    subject: S,
  ): DuplicatePhotoCode<S> => `${subject}_DUPLICATE_PHOTO`,
  photoNotFound: <S extends ExposureSubject>(
    subject: S,
  ): PhotoNotFoundCode<S> => `${subject}_PHOTO_NOT_FOUND`,
};
