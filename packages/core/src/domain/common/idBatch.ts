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

  /** `items` split in order into runs of at most 100, for one lookup each. */
  chunks: <T>(items: readonly T[]): readonly (readonly T[])[] => {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += IdBatch.maxSize) {
      result.push(items.slice(i, i + IdBatch.maxSize));
    }
    return result;
  },
};
