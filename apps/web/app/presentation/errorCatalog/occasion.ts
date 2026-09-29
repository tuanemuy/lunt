import type { OccasionErrorCode } from "@repo/core/domain/occasion/errorCode";
import {
  type BusinessErrorPresentation,
  changed,
  invalid,
} from "./presentation";

/** How each Occasion business error is shown (CS-08 / CS-10). */
export const occasionErrorCatalog = {
  OCCASION_INVALID_NAME: invalid(
    "名称は改行を含めずに100文字以内で入力してください",
  ),
  OCCASION_INVALID_DESCRIPTION: invalid("紹介は2000文字以内で入力してください"),
  OCCASION_ALREADY_CANCELLED: changed(
    "このイベントは、すでに中止になっています",
  ),
  OCCASION_NOT_CANCELLED: changed("このイベントは中止になっていません"),
  OCCASION_ALREADY_PARTICIPATING: changed(
    "この店舗は、すでにこのイベントに参加しています",
  ),
  OCCASION_PLACE_HAS_STEWARD: changed(
    "この店舗には店舗管理者がいるため、イベントの側からは参加を扱えません",
  ),
  OCCASION_PLACE_NOT_VIEWABLE: changed(
    "この店舗は非公開になっているため、参加店舗にできません",
  ),
  OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD: invalid(
    "参加日は開催期間の中から選んでください",
  ),
  OCCASION_LISTING_NOT_ATTACHABLE: changed(
    "選んだ掲載は、公開中でなくなったため添えられません。選び直してください",
  ),
  OCCASION_REGION_ALREADY_LINKED: changed(
    "この地域は、すでに開催地域として関連づけています",
  ),
  OCCASION_REGION_LINK_DETACHED: changed(
    "この地域の運営者が関連づけを解除しているため、関連づけられません",
  ),
  OCCASION_REGION_NOT_VIEWABLE: changed(
    "この地域は公開されていないため、関連づけられません",
  ),
  OCCASION_REGION_LINK_ALREADY_DETACHED: changed(
    "この関連づけは、すでに解除されています",
  ),
  OCCASION_REGION_LINK_NOT_DETACHED: changed(
    "この関連づけは解除されていません",
  ),
} satisfies Record<OccasionErrorCode, BusinessErrorPresentation>;
