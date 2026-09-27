import { BusinessRuleError } from "@repo/core/domain/error";
import { AreaErrorCode } from "./errorCode";

declare const prefectureCodeBrand: unique symbol;
declare const municipalityCodeBrand: unique symbol;

/** A prefecture's code, `"01"`–`"47"`. */
export type PrefectureCode = string & { readonly [prefectureCodeBrand]: true };

/**
 * A municipality's 5-digit local government code (without the check
 * digit). Its first two digits are its prefecture's code.
 */
export type MunicipalityCode = string & {
  readonly [municipalityCodeBrand]: true;
};

const PREFECTURE_PATTERN = /^(0[1-9]|[1-3][0-9]|4[0-7])$/;
const MUNICIPALITY_PATTERN = /^(0[1-9]|[1-3][0-9]|4[0-7])[0-9]{3}$/;

export const PrefectureCode = {
  create: (input: string): PrefectureCode => {
    if (!PREFECTURE_PATTERN.test(input)) {
      throw new BusinessRuleError(
        AreaErrorCode.InvalidPrefectureCode,
        "Prefecture code must be 01-47",
      );
    }
    return input as PrefectureCode;
  },
};

export const MunicipalityCode = {
  create: (input: string): MunicipalityCode => {
    if (!MUNICIPALITY_PATTERN.test(input)) {
      throw new BusinessRuleError(
        AreaErrorCode.InvalidMunicipalityCode,
        "Municipality code must be 5 digits starting with a prefecture code",
      );
    }
    return input as MunicipalityCode;
  },

  prefectureOf: (code: MunicipalityCode): PrefectureCode =>
    code.slice(0, 2) as PrefectureCode,
};
