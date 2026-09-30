import type { PlaceErrorCode } from "@repo/core/domain/place/errorCode";
import { type BusinessErrorPresentation, invalid } from "./presentation";

/** How each Place business error is shown (CS-08 / CS-10). */
export const placeErrorCatalog = {
  PLACE_INVALID_OPERATING_STATUS: invalid("営業状況を選んでください"),
  PLACE_INVALID_NAME: invalid("名称は改行を含めずに入力してください"),
  PLACE_INVALID_DESCRIPTION: invalid("紹介を入力してください"),
  PLACE_INVALID_BUSINESS_HOURS: invalid("営業時間を入力してください"),
  PLACE_INVALID_CONTACT_INFO: invalid("連絡先を入力してください"),
  PLACE_INVALID_MATCH_TEXT: invalid("店名か住所を入力してください"),
  PLACE_INVALID_MATCH_CRITERIA: invalid("店名か住所を入力してください"),
} satisfies Record<PlaceErrorCode, BusinessErrorPresentation>;
