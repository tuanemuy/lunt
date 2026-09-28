import type { ListingErrorCode } from "@repo/core/domain/listing/errorCode";
import {
  type BusinessErrorPresentation,
  changed,
  invalid,
} from "./presentation";

/** How each Listing business error is shown (CS-08 / CS-10). */
export const listingErrorCatalog = {
  LISTING_INVALID_NAME: invalid("名称は改行を含めずに入力してください"),
  LISTING_INVALID_DESCRIPTION: invalid("説明を入力してください"),
  LISTING_INVALID_CATEGORY_NAME: invalid(
    "カテゴリーの名称は改行を含めずに入力してください",
  ),
  LISTING_INVALID_FRAMING: invalid("写真の見せる範囲が正しくありません"),
  LISTING_INVALID_OFFERING_PERIOD: invalid(
    "提供期間は開始日か終了日を入れ、終了日は開始日以降にしてください",
  ),
  LISTING_INVALID_OPEN_DATES: invalid("開催日を1つ以上選んでください"),
  LISTING_DUPLICATE_PHOTOS_MISMATCH: changed(
    "複製の元の写真が変わっています。もう一度複製してください",
  ),
  LISTING_PATCH_PHOTOS_UNAVAILABLE: changed(
    "修正で残る写真がなくなるため、反映できません",
  ),
  LISTING_NOT_PUBLISHED: changed(
    "この掲載は公開中でないため、提供終了にできません",
  ),
  LISTING_ALREADY_ENDED: changed("この掲載は、すでに提供終了になっています"),
  LISTING_NOT_MANUALLY_ENDED: changed(
    "この掲載は、管理する人の操作による提供終了になっていません",
  ),
  LISTING_CATEGORY_NOT_AVAILABLE: invalid(
    "選んだカテゴリーは廃止されました。カテゴリーを選び直してください",
  ),
  LISTING_CATEGORY_CATALOG_ESTABLISHED: changed(
    "カテゴリーは、すでに用意されています",
  ),
  LISTING_CATEGORY_NAME_TAKEN: invalid("同じ名称のカテゴリーがあります"),
  LISTING_CATEGORY_ID_TAKEN: changed("このカテゴリーは、すでにあります"),
  LISTING_CATEGORY_NOT_FOUND: changed("カテゴリーが見つかりません"),
  LISTING_CATEGORY_RETIRED: changed("このカテゴリーは、すでに廃止されています"),
  LISTING_CATEGORY_LAST_ONE: changed("最後の1つのカテゴリーは廃止できません"),
  LISTING_CATEGORY_SUCCESSOR_INVALID: changed(
    "選んだ移行先のカテゴリーは、すでに廃止されていました。現役のカテゴリーから選び直してください",
  ),
} satisfies Record<ListingErrorCode, BusinessErrorPresentation>;
