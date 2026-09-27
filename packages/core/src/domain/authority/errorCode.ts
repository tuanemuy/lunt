/**
 * Authority's `BusinessRuleError` codes (`AUTHORITY_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/authority.ts`.
 */
export const AuthorityErrorCode = {} as const;

export type AuthorityErrorCode =
  (typeof AuthorityErrorCode)[keyof typeof AuthorityErrorCode];
