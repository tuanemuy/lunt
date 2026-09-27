/**
 * Account's `BusinessRuleError` codes (`ACCOUNT_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/account.ts`.
 */
export const AccountErrorCode = {} as const;

export type AccountErrorCode =
  (typeof AccountErrorCode)[keyof typeof AccountErrorCode];
