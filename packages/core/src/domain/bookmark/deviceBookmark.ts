import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import type { BookmarkRef } from "@repo/core/domain/common/refs";
import { BusinessRuleError } from "@repo/core/domain/error";

/**
 * A save a signed-out browser kept on the device, handed over at merge
 * (`spec/domains/bookmark.md` 「値オブジェクト」). The server never checked
 * it: its target need not exist, and its `savedAt` may lie in the future.
 * Two device saves are equal when their targets are.
 */
export type DeviceBookmark = Readonly<{
  target: BookmarkRef;
  savedAt: Date;
}>;

/** `COMMON_INVALID_INPUT` when `savedAt` is not a valid date. */
function create(input: DeviceBookmark): DeviceBookmark {
  if (
    !(input.savedAt instanceof Date) ||
    Number.isNaN(input.savedAt.getTime())
  ) {
    throw new BusinessRuleError(
      CommonErrorCode.InvalidInput,
      "A device bookmark needs a valid savedAt",
    );
  }
  return { target: input.target, savedAt: new Date(input.savedAt) };
}

const equals = (a: DeviceBookmark, b: DeviceBookmark): boolean =>
  a.target.kind === b.target.kind && a.target.id === b.target.id;

export const DeviceBookmark = { create, equals };
