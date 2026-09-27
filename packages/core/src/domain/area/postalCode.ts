import { BusinessRuleError } from "@repo/core/domain/error";
import { AreaErrorCode } from "./errorCode";

declare const postalCodeBrand: unique symbol;

/**
 * A 7-digit postal code the user typed. Not necessarily a town's: the only
 * way from it to an `AreaCode` in the master is
 * `AreaCatalog.findTownsByPostalCode`.
 */
export type PostalCode = string & { readonly [postalCodeBrand]: true };

const FULL_WIDTH_DIGIT = /[０-９]/gu;
const SEPARATOR = /[\s\-‐‑‒–—―−－ー]/gu;
const POSTAL_CODE_PATTERN = /^[0-9]{7}$/;
const FULL_WIDTH_OFFSET = 0xfee0;

export const PostalCode = {
  /**
   * Full-width digits become half-width, hyphens (and the look-alike dashes
   * and prolonged sound mark people type for one) and whitespace are
   * dropped; the rest must be exactly 7 digits.
   */
  create: (input: string): PostalCode => {
    const normalized = input
      .replace(FULL_WIDTH_DIGIT, (digit) =>
        String.fromCharCode(digit.charCodeAt(0) - FULL_WIDTH_OFFSET),
      )
      .replace(SEPARATOR, "");
    if (!POSTAL_CODE_PATTERN.test(normalized)) {
      throw new BusinessRuleError(
        AreaErrorCode.InvalidPostalCode,
        "Postal code must be 7 digits",
      );
    }
    return normalized as PostalCode;
  },

  /** `1000005` → `100-0005`. */
  format: (code: string): string => `${code.slice(0, 3)}-${code.slice(3)}`,
};
