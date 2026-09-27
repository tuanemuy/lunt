import { ExternalProviderKey } from "@repo/core/domain/account/externalIdentity";
import type { ServiceArgs } from "../types";
import type { PendingExternalLogin } from "./externalLogin";

export type BeginExternalLoginInput = Readonly<{
  /** Provider key, e.g. `google`. */
  provider: string;
  /** Absolute URL of the presentation's callback route for `provider`. */
  redirectUri: string;
}>;

/**
 * Starts an external login (MY-02): where to send the browser, and what
 * to keep for the callback (see `externalLogin.ts`). Not a spec usecase —
 * the presentation-side start of `loginWithExternalAccount`.
 *
 * Errors: `BusinessRuleError` `ACCOUNT_UNKNOWN_EXTERNAL_PROVIDER` /
 * `ACCOUNT_INVALID_EXTERNAL_PROVIDER_KEY`; `SystemError` when the
 * provider's discovery document cannot be fetched.
 */
export function beginExternalLogin({
  container,
  input,
}: ServiceArgs<BeginExternalLoginInput>): Promise<
  Readonly<{ authorizationUrl: string; pending: PendingExternalLogin }>
> {
  return container.externalLoginStarter.begin(
    ExternalProviderKey.create(input.provider),
    input.redirectUri,
  );
}
