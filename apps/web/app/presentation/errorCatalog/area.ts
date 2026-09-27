import type { AreaErrorCode } from "@repo/core/domain/area/errorCode";
import { type BusinessErrorPresentation, invalid } from "./presentation";

/** How each Area business error is shown (CS-08 / CS-10). */
export const areaErrorCatalog = {
  AREA_INVALID_POSTAL_CODE: invalid("郵便番号は7桁の数字で入力してください"),
  AREA_INVALID_PREFECTURE_CODE: invalid("都道府県の指定が正しくありません"),
  AREA_INVALID_MUNICIPALITY_CODE: invalid("市区町村の指定が正しくありません"),
  AREA_TOWN_NOT_FOUND: invalid(
    "この郵便番号・町域は見つかりません。都道府県から町域を選んでください",
  ),
} satisfies Record<AreaErrorCode, BusinessErrorPresentation>;
