import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { BusinessRuleError } from "@repo/core/domain/error";

declare const idBrand: unique symbol;

/**
 * Opaque, non-empty identifier tagged with its aggregate's name. The tag is
 * what keeps the ids mutually non-assignable (a `PlaceId` is not a
 * `ListingId`). The format is owned by the `IdGenerator` port, not here.
 */
export type Id<TName extends string> = string & {
  readonly [idBrand]: TName;
};

export type AccountId = Id<"AccountId">;
export type PlaceId = Id<"PlaceId">;
export type ListingId = Id<"ListingId">;
export type CategoryId = Id<"CategoryId">;
export type RegionId = Id<"RegionId">;
export type OccasionId = Id<"OccasionId">;
export type ArticleId = Id<"ArticleId">;
export type ApplicationId = Id<"ApplicationId">;
export type PhotoId = Id<"PhotoId">;
export type InvitationId = Id<"InvitationId">;
export type TakedownClaimId = Id<"TakedownClaimId">;
export type InfoReportId = Id<"InfoReportId">;
export type NotificationId = Id<"NotificationId">;

type IdFactory<TId> = Readonly<{
  /** Throws `BusinessRuleError` (`COMMON_INVALID_{NAME}_ID`) on an empty / blank string. */
  create: (raw: string) => TId;
}>;

const idFactory = <TId extends Id<string>>(
  code: CommonErrorCode,
  label: string,
): IdFactory<TId> => ({
  create: (raw) => {
    if (raw.trim().length === 0) {
      throw new BusinessRuleError(code, `Invalid ${label}`);
    }
    return raw as TId;
  },
});

export const AccountId = idFactory<AccountId>(
  CommonErrorCode.InvalidAccountId,
  "account id",
);
export const PlaceId = idFactory<PlaceId>(
  CommonErrorCode.InvalidPlaceId,
  "place id",
);
export const ListingId = idFactory<ListingId>(
  CommonErrorCode.InvalidListingId,
  "listing id",
);
export const CategoryId = idFactory<CategoryId>(
  CommonErrorCode.InvalidCategoryId,
  "category id",
);
export const RegionId = idFactory<RegionId>(
  CommonErrorCode.InvalidRegionId,
  "region id",
);
export const OccasionId = idFactory<OccasionId>(
  CommonErrorCode.InvalidOccasionId,
  "occasion id",
);
export const ArticleId = idFactory<ArticleId>(
  CommonErrorCode.InvalidArticleId,
  "article id",
);
export const ApplicationId = idFactory<ApplicationId>(
  CommonErrorCode.InvalidApplicationId,
  "application id",
);
export const PhotoId = idFactory<PhotoId>(
  CommonErrorCode.InvalidPhotoId,
  "photo id",
);
export const InvitationId = idFactory<InvitationId>(
  CommonErrorCode.InvalidInvitationId,
  "invitation id",
);
export const TakedownClaimId = idFactory<TakedownClaimId>(
  CommonErrorCode.InvalidTakedownClaimId,
  "takedown claim id",
);
export const InfoReportId = idFactory<InfoReportId>(
  CommonErrorCode.InvalidInfoReportId,
  "info report id",
);
export const NotificationId = idFactory<NotificationId>(
  CommonErrorCode.InvalidNotificationId,
  "notification id",
);
