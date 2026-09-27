import { BusinessRuleError } from "@repo/core/domain/error";
import { MediaErrorCode } from "./errorCode";

declare const photoConsentBrand: unique symbol;

/**
 * The registrant's agreement that they took the photo or were allowed to
 * use it, and to its use on Lunt — one agreement covers both (M-37, B-53).
 * Made per photo registration and never reused for another photo; only
 * `PhotoConsent.agree` makes one, so a registration without consent cannot
 * be expressed.
 */
export type PhotoConsent = Readonly<{
  agreedAt: Date;
  readonly [photoConsentBrand]: true;
}>;

export const PhotoConsent = {
  /** `MEDIA_INVALID_CONSENT` unless `agreed` is `true`. */
  agree: (input: Readonly<{ agreed: boolean }>, now: Date): PhotoConsent => {
    if (input.agreed !== true) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidConsent,
        "Consent to the photo's rights and use is required",
      );
    }
    return { agreedAt: new Date(now.getTime()) } as PhotoConsent;
  },

  equals: (a: PhotoConsent, b: PhotoConsent): boolean =>
    a.agreedAt.getTime() === b.agreedAt.getTime(),
};
