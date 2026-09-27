import { BusinessRuleError } from "@repo/core/domain/error";
import { MediaErrorCode } from "./errorCode";

declare const photoPolicyBrand: unique symbol;

/** Settings of Media: how long an unowned photo is kept. */
export type PhotoPolicy = Readonly<{
  /** A positive integer of milliseconds. */
  unownedRetentionMs: number;
  readonly [photoPolicyBrand]: true;
}>;

export const PhotoPolicy = {
  /** `MEDIA_INVALID_POLICY` unless `unownedRetentionMs` is a positive integer. */
  create: (input: Readonly<{ unownedRetentionMs: number }>): PhotoPolicy => {
    if (
      !Number.isSafeInteger(input.unownedRetentionMs) ||
      input.unownedRetentionMs <= 0
    ) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidPolicy,
        "unownedRetentionMs must be a positive integer",
      );
    }
    return { unownedRetentionMs: input.unownedRetentionMs } as PhotoPolicy;
  },

  /**
   * `now` minus the retention: photos registered before it are abandoned
   * unless owned. The one place that deadline is decided —
   * `PhotoAsset.isAbandoned` and `PhotoAssetRepository.findPageSweepable`
   * both take this value.
   */
  sweepBefore: (policy: PhotoPolicy, now: Date): Date =>
    new Date(now.getTime() - policy.unownedRetentionMs),
};
