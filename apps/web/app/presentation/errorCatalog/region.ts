import type { RegionErrorCode } from "@repo/core/domain/region/errorCode";
import {
  type BusinessErrorPresentation,
  changed,
  invalid,
} from "./presentation";

/** How each Region business error is shown (CS-08 / CS-10). */
export const regionErrorCatalog = {
  REGION_INVALID_NAME: invalid(
    "名称は改行を含めずに100文字以内で入力してください",
  ),
  REGION_INVALID_DESCRIPTION: invalid("紹介は2000文字以内で入力してください"),
  REGION_ALREADY_AFFILIATED: changed(
    "この店舗は、すでにこの地域に所属しています",
  ),
  REGION_NOT_AFFILIATED: changed("この店舗は、この地域に所属していません"),
  REGION_REPRESENTATIVE_ALREADY_CHOSEN: changed(
    "この地域は、すでに代表地域になっています",
  ),
} satisfies Record<RegionErrorCode, BusinessErrorPresentation>;
