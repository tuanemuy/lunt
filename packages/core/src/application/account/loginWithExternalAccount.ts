import { ExternalProviderKey } from "@repo/core/domain/account/externalIdentity";
import { LoginPolicy } from "@repo/core/domain/account/loginPolicy";
import type { ServiceArgs } from "../types";
import {
  type LoginResult,
  resolveLoginAccount,
  toLoginResult,
} from "./loginAccount";

export type LoginWithExternalAccountInput = Readonly<{
  /** Provider key, e.g. `google`. */
  provider: string;
  /**
   * `ExternalLoginProof.encode(pending, callbackQuery)` — see
   * `externalLogin.ts`.
   */
  proof: string;
}>;

/**
 * ACC-02 / KEP-04: verifies what the person brought back from the external
 * provider and answers the account of the provider-verified address —
 * the same account an email login of that address reaches, created on
 * the first login. Verification runs before the unit of work; the only
 * write is the new account's `insert`. Nothing links the external account
 * to the Lunt account.
 *
 * Errors: `BusinessRuleError` `ACCOUNT_UNKNOWN_EXTERNAL_PROVIDER`,
 * `ACCOUNT_INVALID_EXTERNAL_PROVIDER_KEY` (blank),
 * `ACCOUNT_VERIFIED_EMAIL_REQUIRED` (no verified address),
 * `ACCOUNT_EXTERNAL_LOGIN_NOT_AUTHENTICATED` (cancelled or invalid proof);
 * `ConflictError` (the same address registered concurrently);
 * `SystemError` (provider outage).
 */
export async function loginWithExternalAccount({
  container,
  input,
}: ServiceArgs<LoginWithExternalAccountInput>): Promise<LoginResult> {
  const provider = ExternalProviderKey.create(input.provider);
  const identity = await container.externalIdentityVerifier.verify(
    provider,
    input.proof,
  );
  const email = LoginPolicy.fromExternal(identity);
  return container.unitOfWorkProvider.run(async ({ accountRepository }) => {
    const { account, registered } = await resolveLoginAccount(
      accountRepository,
      email,
      container.idGenerator,
    );
    if (registered) await accountRepository.insert(account);
    return toLoginResult(account);
  });
}
