import type { ApplicationErrorCode } from "@repo/core/domain/application/errorCode";
import {
  type BusinessErrorPresentation,
  changed,
  invalid,
} from "./presentation";

/** How each Application business error is shown (CS-08 / CS-10). */
export const applicationErrorCatalog = {
  APPLICATION_UNDER_REVIEW: changed("この申請は、確認中です"),
  APPLICATION_RETURNED: changed("この申請は、差し戻されています"),
  APPLICATION_ALREADY_APPROVED: changed("この申請は、すでに承認されています"),
  APPLICATION_ALREADY_REJECTED: changed("この申請は、すでに否認されています"),
  APPLICATION_ALREADY_WITHDRAWN: changed(
    "この申請は、すでに取り下げられています",
  ),
  APPLICATION_ALREADY_LAPSED: changed(
    "この申請は、前提が成り立たなくなったため失効しています",
  ),
  APPLICATION_PLACE_HAS_STEWARD: changed(
    "この店舗には店舗管理者がいます。店舗管理者が直接変更できます",
  ),
  APPLICATION_PLACE_HAS_NO_STEWARD: changed(
    "この店舗には、いま店舗管理者がいません",
  ),
  APPLICATION_LISTING_NOT_FOUND: changed("対象の掲載は、すでにありません"),
  APPLICATION_ALREADY_AFFILIATED: changed(
    "この店舗は、すでにこの地域に所属しています",
  ),
  APPLICATION_NOT_AFFILIATED: changed("この店舗は、この地域に所属していません"),
  APPLICATION_OCCASION_NOT_OPEN: changed(
    "このイベントは、終了したか中止されています",
  ),
  APPLICATION_ALREADY_PARTICIPATING: changed(
    "この店舗は、すでにこのイベントに参加しています",
  ),
  APPLICATION_ALREADY_STEWARD: changed("すでにこの店舗の店舗管理者です"),
  APPLICATION_REGISTRATION_NOT_STANDING: changed(
    "併せて出した登録申請が、承認されずに終わっています",
  ),
  APPLICATION_TARGET_NOT_VIEWABLE: changed(
    "申請の対象は、いま表示できない状態です",
  ),
  APPLICATION_ALREADY_ACTIVE: changed(
    "同じ内容の申請が、すでに確認中または差し戻し中です",
  ),
  APPLICATION_AWAITING_STEWARDS: changed(
    "この申請は、運営者の判断を待っています。期間を過ぎると代わりに判断できます",
  ),
  APPLICATION_REGISTRATION_PENDING: changed(
    "併せて出された登録申請の判断の後に判断できます",
  ),
  APPLICATION_OVERDUE_PROXY_CANNOT_RETURN: changed(
    "期間超過の代行では、差し戻しはできません",
  ),
  APPLICATION_APPLICANT_WITHDRAWN: changed("申請者は、すでに退会しています"),
  APPLICATION_INVALID_STEWARDSHIP_CLAIM: invalid(
    "店舗との関係と、確認に使える連絡先または資料を入力してください",
  ),
  APPLICATION_INVALID_RETURN_REPLY: invalid("回答を入力してください"),
  APPLICATION_INVALID_RETURN_REQUEST: invalid(
    "追加で必要な確認を入力してください",
  ),
  APPLICATION_INVALID_REJECTION_REASON: invalid("否認の理由を入力してください"),
  APPLICATION_INVALID_REVIEW_POLICY: invalid("判断の設定値が正しくありません"),
} satisfies Record<ApplicationErrorCode, BusinessErrorPresentation>;
