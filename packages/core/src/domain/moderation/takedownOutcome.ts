import { TextNormalization } from "@repo/core/domain/common/textNormalization";
import { BusinessRuleError } from "@repo/core/domain/error";
import { ModerationErrorCode } from "./errorCode";

declare const takedownOutcomeBrand: unique symbol;

/**
 * What the operators did about a takedown claim, or that they took no
 * action (`spec/domains/moderation.md` 「値オブジェクト」): trimmed, 1–2,000
 * characters. Notification's outcome mail only carries the value.
 */
export type TakedownOutcome = string & {
  readonly [takedownOutcomeBrand]: true;
};

export const TakedownOutcome = {
  maxLength: 2000,
  /** Throws `MODERATION_INVALID_TAKEDOWN_OUTCOME` outside 1–2,000 characters after trimming. */
  create: (raw: string): TakedownOutcome => {
    const value = raw.trim();
    const length = TextNormalization.characterCount(value);
    if (length < 1 || length > TakedownOutcome.maxLength) {
      throw new BusinessRuleError(
        ModerationErrorCode.InvalidTakedownOutcome,
        `A takedown outcome must be 1-${TakedownOutcome.maxLength} characters`,
      );
    }
    return value as TakedownOutcome;
  },
};
