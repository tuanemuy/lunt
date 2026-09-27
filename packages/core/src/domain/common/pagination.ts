import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { BusinessRuleError } from "@repo/core/domain/error";

/** Request shape for paginated reads. `page` is 1-indexed. */
export type Pagination = Readonly<{
  page: number;
  limit: number;
}>;

export const Pagination = {
  maxLimit: 100,

  /**
   * The pagination a list read takes (`spec/domains/index.md`): `page` a
   * positive integer, `limit` an integer from 1 to 100. Otherwise
   * `COMMON_INVALID_INPUT`. A page past the end is valid and reads empty.
   */
  create: (input: Pagination): Pagination => {
    if (!Number.isSafeInteger(input.page) || input.page < 1) {
      throw new BusinessRuleError(
        CommonErrorCode.InvalidInput,
        "page must be a positive integer",
      );
    }
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > Pagination.maxLimit
    ) {
      throw new BusinessRuleError(
        CommonErrorCode.InvalidInput,
        `limit must be an integer from 1 to ${Pagination.maxLimit}`,
      );
    }
    return { page: input.page, limit: input.limit };
  },
};

/** `count` is the total matching rows, not just the current page size. */
export type PaginationResult<T> = Readonly<{
  items: readonly T[];
  count: number;
}>;
