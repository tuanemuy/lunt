import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { TextNormalization } from "@repo/core/domain/common/textNormalization";
import { BusinessRuleError } from "@repo/core/domain/error";

declare const taglineBrand: unique symbol;

/** Trimmed catch-copy of 1–60 characters, shared by regions and occasions. */
export type Tagline = string & { readonly [taglineBrand]: true };

export const Tagline = {
  maxLength: 60,
  create: (input: string): Tagline => {
    const trimmed = input.trim();
    const length = TextNormalization.characterCount(trimmed);
    if (length < 1 || length > Tagline.maxLength) {
      throw new BusinessRuleError(
        CommonErrorCode.InvalidTagline,
        `Tagline must be 1-${Tagline.maxLength} characters`,
      );
    }
    return trimmed as Tagline;
  },
};
