/**
 * Account's `BusinessRuleError` codes (`ACCOUNT_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/account.ts`.
 */
export const AccountErrorCode = {
  /** Unknown, used, exhausted or expired login challenge — never told apart. */
  LoginChallengeInvalid: "ACCOUNT_LOGIN_CHALLENGE_INVALID",
  /** Wrong code below the attempt limit; the user may enter it again. */
  LoginCodeMismatch: "ACCOUNT_LOGIN_CODE_MISMATCH",
  InvalidLoginSecret: "ACCOUNT_INVALID_LOGIN_SECRET",
  InvalidExternalProviderKey: "ACCOUNT_INVALID_EXTERNAL_PROVIDER_KEY",
  UnknownExternalProvider: "ACCOUNT_UNKNOWN_EXTERNAL_PROVIDER",
  VerifiedEmailRequired: "ACCOUNT_VERIFIED_EMAIL_REQUIRED",
  ExternalLoginNotAuthenticated: "ACCOUNT_EXTERNAL_LOGIN_NOT_AUTHENTICATED",
} as const;

export type AccountErrorCode =
  (typeof AccountErrorCode)[keyof typeof AccountErrorCode];
