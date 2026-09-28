import type { ModerationErrorCode } from "@repo/core/domain/moderation/errorCode";
import {
  type BusinessErrorPresentation,
  changed,
  invalid,
} from "./presentation";

/** How each Moderation business error is shown (CS-08 / CS-10). */
export const moderationErrorCatalog = {
  MODERATION_INVALID_TAKEDOWN_GROUND: invalid(
    "立場に合わせて、対象と写真を選んでください",
  ),
  MODERATION_INVALID_TAKEDOWN_REASON: invalid(
    "理由を2,000文字以内で入力してください",
  ),
  MODERATION_INVALID_TAKEDOWN_OUTCOME: invalid(
    "結果を2,000文字以内で入力してください",
  ),
  MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE: changed(
    "対象は、いま表示されていません",
  ),
  MODERATION_TAKEDOWN_CLAIM_PHOTO_NOT_IN_TARGET: invalid(
    "選んだ写真の中に、対象からすでに外された写真があります",
  ),
  MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED: changed(
    "この申立ては、すでに対応済みです",
  ),
  MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH: changed(
    "この写真は、申立ての対象のものではありません",
  ),
  MODERATION_INVALID_INFO_REPORT_CATEGORY: invalid("種類を選んでください"),
  MODERATION_INVALID_INFO_REPORT_CONTENT: invalid(
    "内容を2,000文字以内で入力してください",
  ),
  MODERATION_INFO_REPORT_TARGET_UNAVAILABLE: changed(
    "対象は、いま表示されていません",
  ),
  MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD: changed(
    "この店舗には、いま店舗管理者がいません",
  ),
  MODERATION_INFO_REPORT_NOT_OPEN: changed(
    "この連絡は、すでに確認を依頼したか、対応済みです",
  ),
  MODERATION_INFO_REPORT_ALREADY_RESOLVED: changed(
    "この連絡は、すでに対応済みです",
  ),
} satisfies Record<ModerationErrorCode, BusinessErrorPresentation>;
