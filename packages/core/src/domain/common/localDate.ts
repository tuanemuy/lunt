import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { BusinessRuleError } from "@repo/core/domain/error";

declare const localDateBrand: unique symbol;

/**
 * A calendar day in Japan time, as its ISO `YYYY-MM-DD` string. The string
 * form makes `===`, `Set` membership and lexical ordering coincide with
 * calendar equality and ordering, and it serialises without translation.
 */
export type LocalDate = string & { readonly [localDateBrand]: true };

export type LocalDateParts = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

// Japan has no DST, so a fixed offset is exact.
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const invalid = (detail: string): BusinessRuleError<CommonErrorCode> =>
  new BusinessRuleError(
    CommonErrorCode.InvalidLocalDate,
    `Invalid date: ${detail}`,
  );

const pad = (value: number, width: number): string =>
  String(value).padStart(width, "0");

const fromParts = ({ year, month, day }: LocalDateParts): LocalDate => {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    throw invalid(`${year}-${month}-${day}`);
  }
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw invalid(`${year}-${month}-${day}`);
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as LocalDate;
};

const toParts = (date: LocalDate): LocalDateParts => {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return { year, month, day };
};

const toUtcMidnight = (date: LocalDate): Date => {
  const { year, month, day } = toParts(date);
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return d;
};

const fromUtcDate = (d: Date): LocalDate =>
  fromParts({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });

const compare = (a: LocalDate, b: LocalDate): -1 | 0 | 1 =>
  a < b ? -1 : a > b ? 1 : 0;

export const LocalDate = {
  /** The Japan-time (fixed UTC+9) calendar day containing `now`. */
  fromInstant: (now: Date): LocalDate =>
    fromUtcDate(new Date(now.getTime() + JST_OFFSET_MS)),

  /** Throws `COMMON_INVALID_LOCAL_DATE` unless the parts name a real day in years 1–9999. */
  fromParts,

  /** Parses `YYYY-MM-DD`; throws `COMMON_INVALID_LOCAL_DATE` on any other shape or a non-existent day. */
  parse: (input: string): LocalDate => {
    const match = ISO_DATE_PATTERN.exec(input);
    if (match === null) throw invalid(input);
    return fromParts({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    });
  },

  format: (date: LocalDate): string => date,
  toParts,

  compare,
  equals: (a: LocalDate, b: LocalDate): boolean => a === b,
  isBefore: (a: LocalDate, b: LocalDate): boolean => a < b,
  isAfter: (a: LocalDate, b: LocalDate): boolean => a > b,
  min: (a: LocalDate, b: LocalDate): LocalDate => (a <= b ? a : b),
  max: (a: LocalDate, b: LocalDate): LocalDate => (a >= b ? a : b),

  /** `days` may be negative. */
  addDays: (date: LocalDate, days: number): LocalDate =>
    fromUtcDate(new Date(toUtcMidnight(date).getTime() + days * MS_PER_DAY)),

  /** Whole days from `from` to `to` (negative when `to` is earlier). */
  daysBetween: (from: LocalDate, to: LocalDate): number =>
    Math.round(
      (toUtcMidnight(to).getTime() - toUtcMidnight(from).getTime()) /
        MS_PER_DAY,
    ),
};
