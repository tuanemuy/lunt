import type {
  ExternalLoginProof,
  PendingExternalLogin,
} from "@repo/core/application/account/externalLogin";
import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { ExternalIdentity } from "@repo/core/domain/account/externalIdentity";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import * as oauth from "oauth4webapi";
import type { ExternalIdentityProvider } from "../shared/externalIdentityProviders";

export const GOOGLE_ISSUER = new URL("https://accounts.google.com");

export type GoogleOidcSettings = Readonly<{
  clientId: string;
  clientSecret: string;
}>;

/** The HTTP client oauth4webapi uses; injectable for tests. */
export type OidcFetch = (
  url: string,
  init: oauth.CustomFetchOptions<string, unknown>,
) => Promise<Response>;

// Discovery is fetched once per isolate; a failed fetch is forgotten so
// the next login tries again.
const discovery = new Map<string, Promise<oauth.AuthorizationServer>>();

async function authorizationServer(
  issuer: URL,
  fetchOptions: Readonly<{ [oauth.customFetch]?: OidcFetch }>,
): Promise<oauth.AuthorizationServer> {
  const cached = discovery.get(issuer.href);
  if (cached !== undefined) return cached;
  const pending = (async () => {
    try {
      const response = await oauth.discoveryRequest(issuer, {
        algorithm: "oidc",
        ...fetchOptions,
      });
      return await oauth.processDiscoveryResponse(issuer, response);
    } catch (error) {
      throw new SystemError(
        SystemErrorCode.ExternalApiError,
        `OpenID Connect discovery of ${issuer.href} failed`,
        error,
      );
    }
  })();
  discovery.set(issuer.href, pending);
  pending.catch(() => discovery.delete(issuer.href));
  return pending;
}

const NOT_AUTHENTICATED: ExternalIdentity = { outcome: "not_authenticated" };

// Authorization-response errors (RFC 6749 §4.1.2.1) that report the
// provider's own failure, not the person's or the proof's: an outage is a
// `SystemError`, never `not_authenticated`.
const PROVIDER_FAILURES: ReadonlySet<string> = new Set([
  "server_error",
  "temporarily_unavailable",
]);

// Token-endpoint answers that mean "this proof is not valid" — an expired,
// reused or foreign code, or an ID token whose claims do not match the
// attempt — as opposed to an outage or a misconfiguration.
function isInvalidProof(error: unknown): boolean {
  if (error instanceof oauth.ResponseBodyError) {
    return error.status < 500 && error.error === "invalid_grant";
  }
  if (error instanceof oauth.OperationProcessingError) {
    return (
      error.code === oauth.JWT_CLAIM_COMPARISON ||
      error.code === oauth.JWT_TIMESTAMP_CHECK
    );
  }
  return false;
}

/**
 * Google as an OpenID Connect provider (authorization code + PKCE S256,
 * `state`, `nonce`), with `oauth4webapi`. Verifies the callback's `state`,
 * exchanges the code over TLS with the client secret and the PKCE
 * verifier, and checks the ID token's `iss`, `aud`, `exp`, `iat` and
 * `nonce`. Only an address with `email_verified: true` is `verified`.
 *
 * The ID token comes straight from the token endpoint over TLS, which
 * OpenID Connect Core §3.1.3.7 accepts in place of checking its signature.
 */
export class GoogleOidcProvider implements ExternalIdentityProvider {
  private readonly client: oauth.Client;
  private readonly clientAuth: oauth.ClientAuth;
  private readonly issuer: URL;
  private readonly fetchOptions: Readonly<{ [oauth.customFetch]?: OidcFetch }>;

  constructor(
    settings: GoogleOidcSettings,
    options: Readonly<{ issuer?: URL; fetch?: OidcFetch }> = {},
  ) {
    this.client = { client_id: settings.clientId };
    this.clientAuth = oauth.ClientSecretPost(settings.clientSecret);
    this.issuer = options.issuer ?? GOOGLE_ISSUER;
    this.fetchOptions =
      options.fetch === undefined ? {} : { [oauth.customFetch]: options.fetch };
  }

  async authorizationUrl(
    pending: PendingExternalLogin,
    codeChallenge: string,
  ): Promise<string> {
    const as = await authorizationServer(this.issuer, this.fetchOptions);
    if (as.authorization_endpoint === undefined) {
      throw new SystemError(
        SystemErrorCode.ExternalApiError,
        "The provider advertises no authorization endpoint",
      );
    }
    const url = new URL(as.authorization_endpoint);
    url.searchParams.set("client_id", this.client.client_id);
    url.searchParams.set("redirect_uri", pending.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email");
    url.searchParams.set("state", pending.state);
    url.searchParams.set("nonce", pending.nonce);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    // Lets a logged-in person switch to another Google account (MY-02).
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  async verify(proof: ExternalLoginProof): Promise<ExternalIdentity> {
    const as = await authorizationServer(this.issuer, this.fetchOptions);
    let callback: URLSearchParams;
    try {
      callback = oauth.validateAuthResponse(
        as,
        this.client,
        new URLSearchParams(proof.callbackQuery),
        proof.state,
      );
    } catch (error) {
      if (
        error instanceof oauth.AuthorizationResponseError &&
        PROVIDER_FAILURES.has(error.error)
      ) {
        throw new SystemError(
          SystemErrorCode.ExternalApiError,
          `The provider could not authenticate: ${error.error}`,
        );
      }
      // `error=access_denied` (cancelled) or another refusal, a state
      // mismatch, or a callback without a code: nothing to exchange.
      return NOT_AUTHENTICATED;
    }
    if (!callback.get("code")) return NOT_AUTHENTICATED;
    let response: Response;
    try {
      response = await oauth.authorizationCodeGrantRequest(
        as,
        this.client,
        this.clientAuth,
        callback,
        proof.redirectUri,
        proof.codeVerifier,
        this.fetchOptions,
      );
    } catch (error) {
      throw new SystemError(
        SystemErrorCode.NetworkError,
        "The token request to the provider failed",
        error,
      );
    }
    let result: oauth.TokenEndpointResponse;
    try {
      result = await oauth.processAuthorizationCodeResponse(
        as,
        this.client,
        response,
        { expectedNonce: proof.nonce, requireIdToken: true },
      );
    } catch (error) {
      if (isInvalidProof(error)) return NOT_AUTHENTICATED;
      throw new SystemError(
        SystemErrorCode.ExternalApiError,
        "The provider's token response was not usable",
        error,
      );
    }
    const claims = oauth.getValidatedIdTokenClaims(result);
    const email = claims?.email;
    if (typeof email !== "string" || claims?.email_verified !== true) {
      return { outcome: "email_unavailable" };
    }
    try {
      return { outcome: "verified", email: EmailAddress.create(email) };
    } catch {
      return { outcome: "email_unavailable" };
    }
  }
}
