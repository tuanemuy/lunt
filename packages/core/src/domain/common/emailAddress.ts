import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { BusinessRuleError } from "@repo/core/domain/error";

declare const emailAddressBrand: unique symbol;

/** Trimmed, lowercased, well-formed address of at most 254 characters. */
export type EmailAddress = string & { readonly [emailAddressBrand]: true };

// The WHATWG `input[type=email]` grammar (ASCII only), tightened to require
// at least one dot in the domain: a dotless domain is not deliverable on
// the public internet, which is the only place Lunt sends mail.
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export const EmailAddress = {
  maxLength: 254,
  create: (raw: string): EmailAddress => {
    const value = raw.trim().toLowerCase();
    if (value.length > EmailAddress.maxLength || !EMAIL_PATTERN.test(value)) {
      throw new BusinessRuleError(
        CommonErrorCode.InvalidEmailAddress,
        "Invalid email address",
      );
    }
    return value as EmailAddress;
  },
  equals: (a: EmailAddress, b: EmailAddress): boolean => a === b,
};
