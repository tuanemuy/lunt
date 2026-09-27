import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { BusinessRuleError } from "@repo/core/domain/error";
import { AccountErrorCode } from "./errorCode";

declare const externalProviderKeyBrand: unique symbol;

/**
 * Names an external account provider (e.g. `google`). Which keys exist is
 * configuration; `ExternalIdentityVerifier` rejects unknown ones.
 */
export type ExternalProviderKey = string & {
  readonly [externalProviderKeyBrand]: true;
};

export const ExternalProviderKey = {
  /** Trims; `ACCOUNT_INVALID_EXTERNAL_PROVIDER_KEY` when nothing is left. */
  create: (raw: string): ExternalProviderKey => {
    const value = raw.trim();
    if (value.length === 0) {
      throw new BusinessRuleError(
        AccountErrorCode.InvalidExternalProviderKey,
        "Invalid external provider",
      );
    }
    return value as ExternalProviderKey;
  },
  equals: (a: ExternalProviderKey, b: ExternalProviderKey): boolean => a === b,
};

/**
 * What the provider said about the person who came back from it. `verified`
 * carries only an address the provider itself marks as verified.
 */
export type ExternalIdentity =
  | Readonly<{ outcome: "verified"; email: EmailAddress }>
  /** No address, or one the provider has not verified. */
  | Readonly<{ outcome: "email_unavailable" }>
  /** The person cancelled or refused, or the proof is invalid. */
  | Readonly<{ outcome: "not_authenticated" }>;
