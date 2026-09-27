import { BusinessRuleError } from "@repo/core/domain/error";
import { MediaErrorCode } from "./errorCode";

declare const photoPolicyBrand: unique symbol;

/**
 * Settings of Media: how long an unowned photo is kept, and the largest
 * file registration accepts.
 */
export type PhotoPolicy = Readonly<{
  /** A positive integer of milliseconds. */
  unownedRetentionMs: number;
  /** A positive integer of bytes; a larger file is not registered. */
  maxBytes: number;
  readonly [photoPolicyBrand]: true;
}>;

const isPositiveInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

export const PhotoPolicy = {
  /**
   * `MEDIA_INVALID_POLICY` unless `unownedRetentionMs` and `maxBytes` are
   * positive integers.
   */
  create: (
    input: Readonly<{ unownedRetentionMs: number; maxBytes: number }>,
  ): PhotoPolicy => {
    if (!isPositiveInteger(input.unownedRetentionMs)) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidPolicy,
        "unownedRetentionMs must be a positive integer",
      );
    }
    if (!isPositiveInteger(input.maxBytes)) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidPolicy,
        "maxBytes must be a positive integer",
      );
    }
    return {
      unownedRetentionMs: input.unownedRetentionMs,
      maxBytes: input.maxBytes,
    } as PhotoPolicy;
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
