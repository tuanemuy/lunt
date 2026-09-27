/**
 * Authority's `BusinessRuleError` codes (`AUTHORITY_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/authority.ts`.
 */
export const AuthorityErrorCode = {
  AlreadySteward: "AUTHORITY_ALREADY_STEWARD",
  InvitationAlreadyPending: "AUTHORITY_INVITATION_ALREADY_PENDING",
  InvitationNotFound: "AUTHORITY_INVITATION_NOT_FOUND",
  InvitationEmailMismatch: "AUTHORITY_INVITATION_EMAIL_MISMATCH",
  NotASteward: "AUTHORITY_NOT_A_STEWARD",
  OperatorsAlreadyEstablished: "AUTHORITY_OPERATORS_ALREADY_ESTABLISHED",
  OperatorsNotEstablished: "AUTHORITY_OPERATORS_NOT_ESTABLISHED",
  RoleAlreadyHeld: "AUTHORITY_ROLE_ALREADY_HELD",
  RoleNotHeld: "AUTHORITY_ROLE_NOT_HELD",
  LastOperator: "AUTHORITY_LAST_OPERATOR",
} as const;

export type AuthorityErrorCode =
  (typeof AuthorityErrorCode)[keyof typeof AuthorityErrorCode];
