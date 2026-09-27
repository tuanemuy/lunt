import { PendingExternalLogin } from "@repo/core/application/account/externalLogin";
import {
  decodeBase64UrlJson,
  encodeBase64UrlJson,
  hmacSha256,
  timingSafeEqual,
} from "@repo/core/lib/crypto";

/**
 * What the browser carries between the start of an external login and the
 * provider's callback (MY-02): the `pending` login the callback proves, and
 * the path to return to afterwards. Kept in a short-lived, HttpOnly,
 * `SameSite=Lax` cookie scoped to the external-login routes, signed with the
 * session secret so the browser cannot swap in its own `state` or `next`.
 *
 * Format: `base64url(json).hmac`.
 */
export type ExternalLoginState = Readonly<{
  pending: PendingExternalLogin;
  /** A path `safeNextPath` accepted. */
  next: string;
  /** Epoch ms after which the callback refuses the state. */
  expiresAt: number;
}>;

export const EXTERNAL_LOGIN_COOKIE = "lunt_external_login";
/** Only the start and callback routes need the cookie. */
export const EXTERNAL_LOGIN_COOKIE_PATH = "/login/external";
/** Long enough to finish the provider's screens, short enough to go stale. */
export const EXTERNAL_LOGIN_TTL_MS = 10 * 60 * 1000;

const signingInput = (body: string) => `lunt/external-login/v1:${body}`;

export async function signExternalLoginState(
  state: ExternalLoginState,
  secret: string,
): Promise<string> {
  const body = encodeBase64UrlJson(state);
  return `${body}.${await hmacSha256(secret, signingInput(body))}`;
}

function parseState(value: unknown): ExternalLoginState | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const pending = PendingExternalLogin.parse(record.pending);
  if (
    pending === null ||
    typeof record.next !== "string" ||
    typeof record.expiresAt !== "number"
  ) {
    return null;
  }
  return { pending, next: record.next, expiresAt: record.expiresAt };
}

/**
 * The state of a cookie `signExternalLoginState` signed with `secret` that
 * has not expired at `now`; `null` for anything else.
 */
export async function verifyExternalLoginState(
  token: string,
  secret: string,
  now: Date,
): Promise<ExternalLoginState | null> {
  const [body, signature, ...rest] = token.split(".");
  if (body === undefined || signature === undefined || rest.length > 0) {
    return null;
  }
  const expected = await hmacSha256(secret, signingInput(body));
  if (!timingSafeEqual(signature, expected)) return null;
  const state = parseState(decodeBase64UrlJson(body));
  if (state === null || state.expiresAt <= now.getTime()) return null;
  return state;
}
