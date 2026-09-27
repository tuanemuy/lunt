import {
  createPendingExternalLogin,
  ExternalLoginProof,
  type ExternalLoginStarter,
  type PendingExternalLogin,
  pkceChallenge,
} from "@repo/core/application/account/externalLogin";
import { AccountErrorCode } from "@repo/core/domain/account/errorCode";
import type {
  ExternalIdentity,
  ExternalProviderKey,
} from "@repo/core/domain/account/externalIdentity";
import type { ExternalIdentityVerifier } from "@repo/core/domain/account/ports/externalIdentityVerifier";
import { BusinessRuleError } from "@repo/core/domain/error";

/** One OpenID Connect provider as the registry below drives it. */
export interface ExternalIdentityProvider {
  authorizationUrl(
    pending: PendingExternalLogin,
    codeChallenge: string,
  ): Promise<string>;
  /** `proof` has already been decoded and matched to this provider. */
  verify(proof: ExternalLoginProof): Promise<ExternalIdentity>;
}

/**
 * The configured external providers, by key: both the
 * `ExternalIdentityVerifier` port and the `ExternalLoginStarter`. A key
 * not in the map is `ACCOUNT_UNKNOWN_EXTERNAL_PROVIDER`. A `proof` that
 * does not decode, or that was started for another provider, is an
 * invalid proof: `not_authenticated`.
 */
export class ExternalIdentityProviders
  implements ExternalIdentityVerifier, ExternalLoginStarter
{
  readonly providers: readonly ExternalProviderKey[];

  constructor(
    private readonly byKey: ReadonlyMap<
      ExternalProviderKey,
      ExternalIdentityProvider
    >,
  ) {
    this.providers = [...byKey.keys()];
  }

  private provider(key: ExternalProviderKey): ExternalIdentityProvider {
    const provider = this.byKey.get(key);
    if (provider === undefined) {
      throw new BusinessRuleError(
        AccountErrorCode.UnknownExternalProvider,
        `Unknown external provider: ${key}`,
      );
    }
    return provider;
  }

  async begin(
    key: ExternalProviderKey,
    redirectUri: string,
  ): Promise<
    Readonly<{ authorizationUrl: string; pending: PendingExternalLogin }>
  > {
    const provider = this.provider(key);
    const pending = createPendingExternalLogin(key, redirectUri);
    const authorizationUrl = await provider.authorizationUrl(
      pending,
      await pkceChallenge(pending.codeVerifier),
    );
    return { authorizationUrl, pending };
  }

  async verify(
    key: ExternalProviderKey,
    proof: string,
  ): Promise<ExternalIdentity> {
    const provider = this.provider(key);
    const decoded = ExternalLoginProof.decode(proof);
    if (decoded === null || decoded.provider !== key) {
      return { outcome: "not_authenticated" };
    }
    return provider.verify(decoded);
  }
}
