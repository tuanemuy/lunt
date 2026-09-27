import type { BusinessErrorCode } from "@repo/core/domain/businessErrorCode";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import {
  ExposureSubject,
  PublishableSubject,
} from "@repo/core/domain/common/exposureSubject";
import { accountErrorCatalog } from "./errorCatalog/account";
import { applicationErrorCatalog } from "./errorCatalog/application";
import { areaErrorCatalog } from "./errorCatalog/area";
import { authorityErrorCatalog } from "./errorCatalog/authority";
import { discoveryErrorCatalog } from "./errorCatalog/discovery";
import { listingErrorCatalog } from "./errorCatalog/listing";
import { mediaErrorCatalog } from "./errorCatalog/media";
import { notificationErrorCatalog } from "./errorCatalog/notification";
import { placeErrorCatalog } from "./errorCatalog/place";
import {
  type BusinessErrorPresentation,
  changed,
  invalid,
} from "./errorCatalog/presentation";

export type { BusinessErrorPresentation } from "./errorCatalog/presentation";

const SUBJECT_LABEL = {
  LISTING: "掲載",
  PLACE: "店舗",
  REGION: "地域",
  OCCASION: "イベント",
  ARTICLE: "読みもの",
} as const satisfies Record<ExposureSubject, string>;

type Label = (typeof SUBJECT_LABEL)[ExposureSubject];

function perSubject<S extends ExposureSubject, Suffix extends string>(
  subjects: readonly S[],
  suffix: Suffix,
  entry: (label: Label) => BusinessErrorPresentation,
): Record<`${S}_${Suffix}`, BusinessErrorPresentation> {
  return Object.fromEntries(
    subjects.map((subject) => [
      `${subject}_${suffix}`,
      entry(SUBJECT_LABEL[subject]),
    ]),
  ) as Record<`${S}_${Suffix}`, BusinessErrorPresentation>;
}

const INVALID_ID = invalid("指定された対象が正しくありません");

/**
 * The presentation of every business error code. Typed over
 * `BusinessErrorCode`, so a code without an entry — or an entry for a code
 * that no longer exists — is a compile error.
 */
export const businessErrorCatalog = {
  [CommonErrorCode.InvalidEmailAddress]: invalid(
    "メールアドレスの形式が正しくありません",
  ),
  [CommonErrorCode.InvalidAreaCode]: invalid(
    "郵便番号の形式が正しくありません",
  ),
  [CommonErrorCode.InvalidLocalDate]: invalid("日付が正しくありません"),
  [CommonErrorCode.InvalidDateRange]: invalid(
    "終了日は開始日以降にしてください",
  ),
  [CommonErrorCode.InvalidGeoPoint]: invalid("位置が正しくありません"),
  [CommonErrorCode.InvalidGeoBounds]: invalid("範囲が正しくありません"),
  [CommonErrorCode.InvalidTagline]: invalid(
    "キャッチコピーは1〜60文字で入力してください",
  ),
  [CommonErrorCode.InvalidSearchKeyword]: invalid(
    "キーワードは100文字以内で入力してください",
  ),
  [CommonErrorCode.InvalidFieldPatch]: invalid("変更した項目がありません"),
  [CommonErrorCode.InvalidInput]: invalid("入力内容が正しくありません"),
  [CommonErrorCode.PublicationInvalidTransition]: changed(
    "公開状態が変わっています。最新の状態を確かめてください",
  ),
  [CommonErrorCode.InvalidAccountId]: INVALID_ID,
  [CommonErrorCode.InvalidPlaceId]: INVALID_ID,
  [CommonErrorCode.InvalidListingId]: INVALID_ID,
  [CommonErrorCode.InvalidCategoryId]: INVALID_ID,
  [CommonErrorCode.InvalidRegionId]: INVALID_ID,
  [CommonErrorCode.InvalidOccasionId]: INVALID_ID,
  [CommonErrorCode.InvalidArticleId]: INVALID_ID,
  [CommonErrorCode.InvalidApplicationId]: INVALID_ID,
  [CommonErrorCode.InvalidPhotoId]: INVALID_ID,
  [CommonErrorCode.InvalidInvitationId]: INVALID_ID,
  [CommonErrorCode.InvalidTakedownClaimId]: INVALID_ID,
  [CommonErrorCode.InvalidInfoReportId]: INVALID_ID,
  [CommonErrorCode.InvalidNotificationId]: INVALID_ID,
  ...perSubject(ExposureSubject.all, "SUSPENDED", (label) =>
    changed(
      `この${label}は運営によって非公開になっているため、公開状態を変えられません`,
    ),
  ),
  ...perSubject(PublishableSubject.all, "PUBLISH_CONDITION_UNMET", () =>
    invalid("公開に必要な項目が足りません"),
  ),
  ...perSubject(ExposureSubject.all, "ALREADY_SUSPENDED", (label) =>
    changed(`この${label}はすでに運営によって非公開になっています`),
  ),
  ...perSubject(ExposureSubject.all, "NOT_SUSPENDED", (label) =>
    changed(`この${label}は運営による非公開になっていません`),
  ),
  ...perSubject(ExposureSubject.all, "DUPLICATE_PHOTO", () =>
    invalid("同じ写真が重なっています"),
  ),
  ...perSubject(ExposureSubject.all, "PHOTO_NOT_FOUND", (label) =>
    changed(`指定した写真は、すでにこの${label}にありません`),
  ),
  ...accountErrorCatalog,
  ...authorityErrorCatalog,
  ...applicationErrorCatalog,
  ...notificationErrorCatalog,
  ...areaErrorCatalog,
  ...mediaErrorCatalog,
  ...placeErrorCatalog,
  ...listingErrorCatalog,
  ...discoveryErrorCatalog,
} satisfies Record<BusinessErrorCode, BusinessErrorPresentation>;

type StaleCode = Exclude<keyof typeof businessErrorCatalog, BusinessErrorCode>;
const noStaleCode: [StaleCode] extends [never] ? true : StaleCode = true;
void noStaleCode;

const catalog: Readonly<Record<string, BusinessErrorPresentation | undefined>> =
  businessErrorCatalog;

/** A code this build does not know (e.g. from a newer server) reads as CS-08. */
const UNKNOWN_BUSINESS_ERROR = changed(
  "状態が変わったため、操作できませんでした",
);

export function presentBusinessError(
  code: string | null,
): BusinessErrorPresentation {
  return (code === null ? undefined : catalog[code]) ?? UNKNOWN_BUSINESS_ERROR;
}
