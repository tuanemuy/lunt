import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { BusinessRuleError } from "@repo/core/domain/error";

declare const areaCodeBrand: unique symbol;

/**
 * The 7-digit postal code of a town, identifying an area. Only the format is
 * checked here; whether the code exists in the master is `AreaCatalog`'s
 * question, and normalising user-typed postal codes is `PostalCode.create`'s.
 */
export type AreaCode = string & { readonly [areaCodeBrand]: true };

const AREA_CODE_PATTERN = /^[0-9]{7}$/;

export const AreaCode = {
  create: (input: string): AreaCode => {
    if (!AREA_CODE_PATTERN.test(input)) {
      throw new BusinessRuleError(
        CommonErrorCode.InvalidAreaCode,
        "Area code must be 7 digits",
      );
    }
    return input as AreaCode;
  },
};
