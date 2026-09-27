import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import { BusinessRuleError } from "@repo/core/domain/error";

declare const dateRangeBrand: unique symbol;

/** Inclusive span of calendar days with `start <= end` (an occasion's period). */
export type DateRange = Readonly<{ start: LocalDate; end: LocalDate }> & {
  readonly [dateRangeBrand]: true;
};

export const DateRange = {
  create: (start: LocalDate, end: LocalDate): DateRange => {
    if (end < start) {
      throw new BusinessRuleError(
        CommonErrorCode.InvalidDateRange,
        `Date range ends (${end}) before it starts (${start})`,
      );
    }
    return { start, end } as DateRange;
  },
  contains: (range: DateRange, date: LocalDate): boolean =>
    range.start <= date && date <= range.end,
  equals: (a: DateRange, b: DateRange): boolean =>
    a.start === b.start && a.end === b.end,
};
