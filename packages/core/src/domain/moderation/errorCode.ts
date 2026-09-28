/**
 * Moderation's `BusinessRuleError` codes (`MODERATION_…`,
 * `spec/domains/moderation.md`). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/moderation.ts`.
 */
export const ModerationErrorCode = {
  InvalidTakedownGround: "MODERATION_INVALID_TAKEDOWN_GROUND",
  InvalidTakedownReason: "MODERATION_INVALID_TAKEDOWN_REASON",
  InvalidTakedownOutcome: "MODERATION_INVALID_TAKEDOWN_OUTCOME",
  TakedownClaimTargetUnavailable:
    "MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE",
  TakedownClaimPhotoNotInTarget:
    "MODERATION_TAKEDOWN_CLAIM_PHOTO_NOT_IN_TARGET",
  TakedownClaimAlreadyResolved: "MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED",
  TakedownClaimTargetMismatch: "MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH",
  InvalidInfoReportCategory: "MODERATION_INVALID_INFO_REPORT_CATEGORY",
  InvalidInfoReportContent: "MODERATION_INVALID_INFO_REPORT_CONTENT",
  InfoReportTargetUnavailable: "MODERATION_INFO_REPORT_TARGET_UNAVAILABLE",
  InfoReportPlaceWithoutSteward: "MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD",
  InfoReportNotOpen: "MODERATION_INFO_REPORT_NOT_OPEN",
  InfoReportAlreadyResolved: "MODERATION_INFO_REPORT_ALREADY_RESOLVED",
} as const;

export type ModerationErrorCode =
  (typeof ModerationErrorCode)[keyof typeof ModerationErrorCode];
