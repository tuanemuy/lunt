import {
  AccountId,
  ApplicationId,
  ArticleId,
  CategoryId,
  InfoReportId,
  InvitationId,
  ListingId,
  NotificationId,
  OccasionId,
  PhotoId,
  PlaceId,
  RegionId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import { describe, expect, expectTypeOf, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

const factories = [
  ["AccountId", AccountId, "COMMON_INVALID_ACCOUNT_ID"],
  ["PlaceId", PlaceId, "COMMON_INVALID_PLACE_ID"],
  ["ListingId", ListingId, "COMMON_INVALID_LISTING_ID"],
  ["CategoryId", CategoryId, "COMMON_INVALID_CATEGORY_ID"],
  ["RegionId", RegionId, "COMMON_INVALID_REGION_ID"],
  ["OccasionId", OccasionId, "COMMON_INVALID_OCCASION_ID"],
  ["ArticleId", ArticleId, "COMMON_INVALID_ARTICLE_ID"],
  ["ApplicationId", ApplicationId, "COMMON_INVALID_APPLICATION_ID"],
  ["PhotoId", PhotoId, "COMMON_INVALID_PHOTO_ID"],
  ["InvitationId", InvitationId, "COMMON_INVALID_INVITATION_ID"],
  ["TakedownClaimId", TakedownClaimId, "COMMON_INVALID_TAKEDOWN_CLAIM_ID"],
  ["InfoReportId", InfoReportId, "COMMON_INVALID_INFO_REPORT_ID"],
  ["NotificationId", NotificationId, "COMMON_INVALID_NOTIFICATION_ID"],
] as const;

describe("shared-kernel ids (opaque non-empty strings)", () => {
  it.each(factories)(
    "%s.create keeps a non-empty value as is",
    (_name, factory) => {
      expect(factory.create("0193e7d0-0001-7000-8000-100000000000")).toBe(
        "0193e7d0-0001-7000-8000-100000000000",
      );
      expect(factory.create("any-opaque-format")).toBe("any-opaque-format");
    },
  );

  it.each(factories)(
    "%s.create rejects empty / blank with its code",
    (_name, factory, code) => {
      expectBusinessError(() => factory.create(""), code);
      expectBusinessError(() => factory.create("   "), code);
    },
  );

  it("brands are mutually non-assignable", () => {
    expectTypeOf<PlaceId>().not.toExtend<ListingId>();
    expectTypeOf<ListingId>().not.toExtend<PlaceId>();
    expectTypeOf<AccountId>().not.toExtend<ApplicationId>();
    expectTypeOf<string>().not.toExtend<PhotoId>();
    expectTypeOf<PhotoId>().toExtend<string>();
  });
});
