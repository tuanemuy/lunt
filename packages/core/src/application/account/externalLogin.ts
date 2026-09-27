import type { ExternalProviderKey } from "@repo/core/domain/account/externalIdentity";
import {
  decodeBase64UrlJson,
  encodeBase64UrlJson,
  sha256,
  toBase64Url,
} from "@repo/core/lib/crypto";
import { z } from "zod";

/**
 * External login (MY-02, `spec/domains/account.md`
 * 「ExternalIdentityVerifier」) as an OpenID Connect authorization code flow
 * with PKCE, `state` and `nonce`. The same flow runs against Google and
 * against the development fake provider (design.md D-07); only the
 * provider's screen differs.
 *
 * 1. Start: `beginExternalLogin` → `{ authorizationUrl, pending }`. The
 *    presentation keeps `pending` in a short-lived, signed, HttpOnly,
 *    `SameSite=Lax` cookie and redirects the browser to
 *    `authorizationUrl`.
 * 2. Callback (`pending.redirectUri`, a GET from the provider): the
 *    presentation reads the cookie back and packs
 *    `ExternalLoginProof.encode(pending, callbackQuery)` — the callback
 *    URL's raw query string, error or code alike — as the `proof` of
 *    `loginWithExternalAccount`.
 *
 * Checking `state`, exchanging the code with the PKCE verifier, and
 * checking the ID token's `nonce` all happen in the verifier adapter.
 */
export type PendingExternalLogin = Readonly<{
  provider: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
}>;

/** What `ExternalIdentityVerifier.verify` receives, decoded from `proof`. */
export type ExternalLoginProof = PendingExternalLogin &
  Readonly<{
    /** The callback URL's query string (`?code=…&state=…` or `?error=…`). */
    callbackQuery: string;
  }>;

const proofSchema = z.object({
  v: z.literal(1),
  provider: z.string().min(1).max(64),
  state: z.string().min(1).max(512),
  nonce: z.string().min(1).max(512),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.url().max(2048),
  callbackQuery: z.string().max(8192),
});

const pendingSchema = proofSchema.omit({ v: true, callbackQuery: true });

export const ExternalLoginProof = {
  /** Packs the callback into the opaque `proof` string (base64url JSON). */
  encode: (pending: PendingExternalLogin, callbackQuery: string): string =>
    encodeBase64UrlJson({
      v: 1,
      provider: pending.provider,
      state: pending.state,
      nonce: pending.nonce,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
      callbackQuery,
    }),

  /** The proof, or `null` when `raw` is not one `encode` produced. */
  decode: (raw: string): ExternalLoginProof | null => {
    const parsed = proofSchema.safeParse(decodeBase64UrlJson(raw));
    if (!parsed.success) return null;
    const { v: _, ...proof } = parsed.data;
    return proof;
  },
};

export const PendingExternalLogin = {
  /**
   * Parses a stored `pending` (e.g. the cookie's JSON), `null` when it is
   * not one.
   */
  parse: (value: unknown): PendingExternalLogin | null => {
    const parsed = pendingSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  },
};

function randomToken(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toBase64Url(buffer);
}

/** Fresh `state`, `nonce` and PKCE verifier for one login attempt. */
export function createPendingExternalLogin(
  provider: ExternalProviderKey,
  redirectUri: string,
): PendingExternalLogin {
  return {
    provider,
    state: randomToken(32),
    nonce: randomToken(32),
    codeVerifier: randomToken(32),
    redirectUri,
  };
}

/** RFC 7636 `S256` code challenge of a PKCE verifier. */
export function pkceChallenge(codeVerifier: string): Promise<string> {
  return sha256(codeVerifier);
}

/**
 * Starts external logins: the redirect to a configured provider. On the
 * container as `externalLoginStarter`.
 */
export interface ExternalLoginStarter {
  /** Configured providers, in the order the login screen offers them. */
  readonly providers: readonly ExternalProviderKey[];
  /**
   * The provider's authorization URL for a fresh attempt, and what the
   * callback needs back. `BusinessRuleError`
   * (`ACCOUNT_UNKNOWN_EXTERNAL_PROVIDER`) for an unconfigured provider.
   */
  begin(
    provider: ExternalProviderKey,
    redirectUri: string,
  ): Promise<
    Readonly<{ authorizationUrl: string; pending: PendingExternalLogin }>
  >;
}
