/**
 * Application's `BusinessRuleError` codes (`APPLICATION_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/application.ts`.
 */
export const ApplicationErrorCode = {
  UnderReview: "APPLICATION_UNDER_REVIEW",
  Returned: "APPLICATION_RETURNED",
  AlreadyApproved: "APPLICATION_ALREADY_APPROVED",
  AlreadyRejected: "APPLICATION_ALREADY_REJECTED",
  AlreadyWithdrawn: "APPLICATION_ALREADY_WITHDRAWN",
  AlreadyLapsed: "APPLICATION_ALREADY_LAPSED",
  PlaceHasSteward: "APPLICATION_PLACE_HAS_STEWARD",
  PlaceHasNoSteward: "APPLICATION_PLACE_HAS_NO_STEWARD",
  ListingNotFound: "APPLICATION_LISTING_NOT_FOUND",
  AlreadyAffiliated: "APPLICATION_ALREADY_AFFILIATED",
  NotAffiliated: "APPLICATION_NOT_AFFILIATED",
  OccasionNotOpen: "APPLICATION_OCCASION_NOT_OPEN",
  AlreadyParticipating: "APPLICATION_ALREADY_PARTICIPATING",
  AlreadySteward: "APPLICATION_ALREADY_STEWARD",
  RegistrationNotStanding: "APPLICATION_REGISTRATION_NOT_STANDING",
  TargetNotViewable: "APPLICATION_TARGET_NOT_VIEWABLE",
  AlreadyActive: "APPLICATION_ALREADY_ACTIVE",
  AwaitingStewards: "APPLICATION_AWAITING_STEWARDS",
  RegistrationPending: "APPLICATION_REGISTRATION_PENDING",
  OverdueProxyCannotReturn: "APPLICATION_OVERDUE_PROXY_CANNOT_RETURN",
  ApplicantWithdrawn: "APPLICATION_APPLICANT_WITHDRAWN",
  InvalidStewardshipClaim: "APPLICATION_INVALID_STEWARDSHIP_CLAIM",
  InvalidReturnReply: "APPLICATION_INVALID_RETURN_REPLY",
  InvalidReturnRequest: "APPLICATION_INVALID_RETURN_REQUEST",
  InvalidRejectionReason: "APPLICATION_INVALID_REJECTION_REASON",
  InvalidReviewPolicy: "APPLICATION_INVALID_REVIEW_POLICY",
} as const;

export type ApplicationErrorCode =
  (typeof ApplicationErrorCode)[keyof typeof ApplicationErrorCode];
