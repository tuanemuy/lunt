import {
  MediaErrorCode,
  type MediaErrorCode as MediaErrorCodeValue,
} from "@repo/core/domain/media/errorCode";
import {
  type BusinessErrorPresentation,
  changed,
  invalid,
} from "./presentation";

/** How each Media business error is shown (CS-08 / CS-10). */
export const mediaErrorCatalog = {
  [MediaErrorCode.InvalidConsent]: invalid(
    "写真を登録するには、自ら撮影した写真または利用の許諾を得た写真であることと、Lunt での利用に同意してください",
  ),
  [MediaErrorCode.InvalidFormat]: invalid("写真の形式を読み取れませんでした"),
  [MediaErrorCode.NotAPhoto]: invalid(
    "このファイルは写真として扱えません。JPEG・PNG・WebP の静止画（縦横とも16384ピクセルまで）を選んでください",
  ),
  [MediaErrorCode.InvalidPolicy]: invalid("写真の設定値が正しくありません"),
  [MediaErrorCode.DuplicateSourceUnavailable]: changed(
    "複製しようとした写真の一部が、すでに削除されています。写真を確かめてからやり直してください",
  ),
  [MediaErrorCode.PhotoNotAvailable]: changed(
    "選んだ写真の一部が、すでに削除されています。写真を登録し直してください",
  ),
  [MediaErrorCode.PhotoAlreadyOwned]: changed(
    "選んだ写真の一部は、すでに別の場所で使われています。写真を登録し直してください",
  ),
  [MediaErrorCode.PhotoNotRegistrant]: invalid(
    "ほかの人が登録した写真は使えません。写真を登録し直してください",
  ),
  [MediaErrorCode.PhotoOwnerMismatch]: changed(
    "申請の写真の状態が変わっています。申請を確かめてからやり直してください",
  ),
} satisfies Record<MediaErrorCodeValue, BusinessErrorPresentation>;
