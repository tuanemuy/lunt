import { BusinessRuleError } from "@repo/core/domain/error";
import { ApplicationErrorCode } from "./errorCode";

declare const returnReplyBrand: unique symbol;
declare const returnRequestBrand: unique symbol;
declare const rejectionReasonBrand: unique symbol;

/** The applicant's answer attached to a resubmission (回答). */
export type ReturnReply = string & { readonly [returnReplyBrand]: true };
/** What the approver needs confirmed, attached to a return (追加で必要な確認). */
export type ReturnRequest = string & { readonly [returnRequestBrand]: true };
/** Why the approver rejected (否認の理由). */
export type RejectionReason = string & {
  readonly [rejectionReasonBrand]: true;
};

/** Trimmed, non-empty free text; `code` on an empty result. */
const text = <T extends string>(code: ApplicationErrorCode, label: string) => ({
  create: (input: string): T => {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(code, `${label} must not be empty`);
    }
    return trimmed as T;
  },
});

/** An unanswered reply is `null`, never an empty string. */
export const ReturnReply = text<ReturnReply>(
  ApplicationErrorCode.InvalidReturnReply,
  "A reply",
);
export const ReturnRequest = text<ReturnRequest>(
  ApplicationErrorCode.InvalidReturnRequest,
  "A return request",
);
export const RejectionReason = text<RejectionReason>(
  ApplicationErrorCode.InvalidRejectionReason,
  "A rejection reason",
);
