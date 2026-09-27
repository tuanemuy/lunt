import { BusinessRuleError } from "@repo/core/domain/error";
import { PlaceErrorCode } from "./errorCode";

/** 営業中 | 休業 | 閉店. Any status can change to any other. */
export type OperatingStatus =
  | "open"
  | "temporarilyClosed"
  | "permanentlyClosed";

const VALUES = [
  "open",
  "temporarilyClosed",
  "permanentlyClosed",
] as const satisfies readonly OperatingStatus[];

const isOperatingStatus = (input: string): input is OperatingStatus =>
  (VALUES as readonly string[]).includes(input);

export const OperatingStatus = {
  values: VALUES,
  is: isOperatingStatus,
  /** Throws `PLACE_INVALID_OPERATING_STATUS` for a value outside the list. */
  create: (input: string): OperatingStatus => {
    if (!isOperatingStatus(input)) {
      throw new BusinessRuleError(
        PlaceErrorCode.InvalidOperatingStatus,
        `Invalid operating status: ${input}`,
      );
    }
    return input;
  },
  equals: (a: OperatingStatus, b: OperatingStatus): boolean => a === b,
};
