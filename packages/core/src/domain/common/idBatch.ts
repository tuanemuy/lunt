import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { BusinessRuleError } from "@repo/core/domain/error";

/**
 * Lookups by id / key (`findByIds` and the like) accept 0–100 inputs;
 * callers split larger sets themselves.
 */
export const IdBatch = {
  maxSize: 100,

  /** Throws `COMMON_INVALID_INPUT` when `ids` holds more than 100 entries. */
  assertWithinLimit: (ids: readonly unknown[]): void => {
    if (ids.length > IdBatch.maxSize) {
      throw new BusinessRuleError(
        CommonErrorCode.InvalidInput,
        `At most ${IdBatch.maxSize} ids per lookup`,
      );
    }
  },
};
