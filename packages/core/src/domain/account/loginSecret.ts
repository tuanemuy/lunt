import { BusinessRuleError } from "@repo/core/domain/error";
import { AccountErrorCode } from "./errorCode";

declare const linkTokenBrand: unique symbol;
declare const loginCodeBrand: unique symbol;
declare const secretDigestBrand: unique symbol;

/**
 * The secret carried by the login mail's link. Its format is the
 * `LoginSecretGenerator`'s; it is never stored — only its digest is.
 */
export type LinkToken = string & { readonly [linkTokenBrand]: true };

/** The secret the user types in the browser that asked for the mail. */
export type LoginCode = string & { readonly [loginCodeBrand]: true };

/**
 * One-way digest of a `LinkToken` or a `LoginCode`. Equal digests mean
 * equal secrets. Minted by `LoginSecretGenerator.digest`; adapters
 * rebuild stored ones with `SecretDigest.create`.
 */
export type SecretDigest = string & { readonly [secretDigestBrand]: true };

function nonBlankSecret(raw: string, label: string): string {
  const value = raw.trim();
  if (value.length === 0) {
    throw new BusinessRuleError(
      AccountErrorCode.InvalidLoginSecret,
      `Invalid ${label}`,
    );
  }
  return value;
}

export const LinkToken = {
  /** Trims; `ACCOUNT_INVALID_LOGIN_SECRET` when nothing is left. */
  create: (raw: string): LinkToken =>
    nonBlankSecret(raw, "link token") as LinkToken,
};

export const LoginCode = {
  /** Trims; `ACCOUNT_INVALID_LOGIN_SECRET` when nothing is left. */
  create: (raw: string): LoginCode =>
    nonBlankSecret(raw, "login code") as LoginCode,
};

export const SecretDigest = {
  /**
   * For the generator and for rehydration: a non-blank string without
   * surrounding whitespace.
   */
  create: (raw: string): SecretDigest => {
    if (raw.length === 0 || raw !== raw.trim()) {
      throw new BusinessRuleError(
        AccountErrorCode.InvalidLoginSecret,
        "Invalid secret digest",
      );
    }
    return raw as SecretDigest;
  },
  equals: (a: SecretDigest, b: SecretDigest): boolean => a === b,
};
