/**
 * Application's `BusinessRuleError` codes (`APPLICATION_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/application.ts`.
 */
export const ApplicationErrorCode = {} as const;

export type ApplicationErrorCode =
  (typeof ApplicationErrorCode)[keyof typeof ApplicationErrorCode];
