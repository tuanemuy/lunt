import type {
  CommonErrorCode,
  SubjectErrorCode,
} from "@repo/core/domain/common/errorCode";

/**
 * Every `BusinessRuleError` code a Lunt usecase can raise. Each domain
 * adds its code union here as it lands. The presentation layer maps
 * every member to the common state it shows (`spec/pages/index.md`
 * CS-08 / CS-10) in a table typed over this union, so a new code does not
 * compile until someone decides how the screen presents it.
 */
export type BusinessErrorCode = CommonErrorCode | SubjectErrorCode;
