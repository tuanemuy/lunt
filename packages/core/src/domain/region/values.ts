import { TextNormalization } from "@repo/core/domain/common/textNormalization";
import { BusinessRuleError } from "@repo/core/domain/error";
import { RegionErrorCode } from "./errorCode";

declare const regionNameBrand: unique symbol;
declare const regionDescriptionBrand: unique symbol;

/** A region's name: trimmed, 1–100 characters, one line. */
export type RegionName = string & { readonly [regionNameBrand]: true };

/** A region's introduction: trimmed, 1–2000 characters; may span lines. */
export type RegionDescription = string & {
  readonly [regionDescriptionBrand]: true;
};

const LINE_BREAK = /[\r\n\u2028\u2029]/u;

const withinLength = (value: string, max: number): boolean => {
  const length = TextNormalization.characterCount(value);
  return length >= 1 && length <= max;
};

export const RegionName = {
  maxLength: 100,
  /** Throws `REGION_INVALID_NAME` unless 1–100 characters without a line break. */
  create: (input: string): RegionName => {
    const value = input.trim();
    if (!withinLength(value, RegionName.maxLength) || LINE_BREAK.test(value)) {
      throw new BusinessRuleError(
        RegionErrorCode.InvalidName,
        "Invalid region name",
      );
    }
    return value as RegionName;
  },
};

export const RegionDescription = {
  maxLength: 2000,
  /** Throws `REGION_INVALID_DESCRIPTION` unless 1–2000 characters. */
  create: (input: string): RegionDescription => {
    const value = input.trim();
    if (!withinLength(value, RegionDescription.maxLength)) {
      throw new BusinessRuleError(
        RegionErrorCode.InvalidDescription,
        "Invalid region description",
      );
    }
    return value as RegionDescription;
  },
};
