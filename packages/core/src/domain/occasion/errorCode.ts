/**
 * Occasion's `BusinessRuleError` codes (`OCCASION_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/occasion.ts`. The shared-kernel
 * codes raised under the `OCCASION` prefix (`OCCASION_SUSPENDED`,
 * `OCCASION_PUBLISH_CONDITION_UNMET`, `OCCASION_ALREADY_SUSPENDED`,
 * `OCCASION_NOT_SUSPENDED`, `OCCASION_DUPLICATE_PHOTO`,
 * `OCCASION_PHOTO_NOT_FOUND`) are `SubjectErrorCode<"OCCASION">`.
 */
export const OccasionErrorCode = {
  InvalidName: "OCCASION_INVALID_NAME",
  InvalidDescription: "OCCASION_INVALID_DESCRIPTION",
  AlreadyCancelled: "OCCASION_ALREADY_CANCELLED",
  NotCancelled: "OCCASION_NOT_CANCELLED",
  AlreadyParticipating: "OCCASION_ALREADY_PARTICIPATING",
  PlaceHasSteward: "OCCASION_PLACE_HAS_STEWARD",
  PlaceNotViewable: "OCCASION_PLACE_NOT_VIEWABLE",
  ParticipationDateOutOfPeriod: "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD",
  ListingNotAttachable: "OCCASION_LISTING_NOT_ATTACHABLE",
  RegionAlreadyLinked: "OCCASION_REGION_ALREADY_LINKED",
  RegionLinkDetached: "OCCASION_REGION_LINK_DETACHED",
  RegionNotViewable: "OCCASION_REGION_NOT_VIEWABLE",
  RegionLinkAlreadyDetached: "OCCASION_REGION_LINK_ALREADY_DETACHED",
  RegionLinkNotDetached: "OCCASION_REGION_LINK_NOT_DETACHED",
} as const;

export type OccasionErrorCode =
  (typeof OccasionErrorCode)[keyof typeof OccasionErrorCode];
