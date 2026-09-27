import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Account } from "./entity";
import { AccountErrorCode } from "./errorCode";
import type { ExternalIdentity } from "./externalIdentity";

/**
 * Which account a successful login lands on (`spec/domains/account.md`
 * 「LoginPolicy」). Email and external logins share it, so one address is
 * always one account.
 */
export const LoginPolicy = {
  /**
   * The existing account of `email`, or a new one registered with
   * `newAccountId`. `registered` tells the usecase to `insert` it.
   */
  resolve: (
    email: EmailAddress,
    existing: Account | null,
    newAccountId: string,
  ): Readonly<{ account: Account; registered: boolean }> =>
    existing !== null
      ? { account: existing, registered: false }
      : {
          account: Account.register({ id: newAccountId, email }),
          registered: true,
        },

  /**
   * The verified address of an external login. `email_unavailable` and
   * `not_authenticated` end the login without an account.
   */
  fromExternal: (identity: ExternalIdentity): EmailAddress => {
    switch (identity.outcome) {
      case "verified":
        return identity.email;
      case "email_unavailable":
        throw new BusinessRuleError(
          AccountErrorCode.VerifiedEmailRequired,
          "The provider did not share a verified email address",
        );
      case "not_authenticated":
        throw new BusinessRuleError(
          AccountErrorCode.ExternalLoginNotAuthenticated,
          "The external login did not complete",
        );
    }
  },
};
