/**
 * The session cookie's value (design.md D-06): which account the browser
 * logged in as, when, and until when — signed with HMAC-SHA-256 so the
 * browser cannot forge or alter it. It carries no authority by itself:
 * the `Actor` boundary still checks that the account exists on every
 * request, which is what makes a withdrawn account's session dead.
 *
 * Format: `base64url(json payload).base64url(signature)`.
 */
export type SessionClaims = Readonly<{
  accountId: string;
  issuedAt: number;
  expiresAt: number;
}>;

/** Browsers keep a login for 30 days; logging in again renews it. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSession(
  claims: SessionClaims,
  secret: string,
): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(body),
  );
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

function isClaims(value: unknown): value is SessionClaims {
  if (typeof value !== "object" || value === null) return false;
  const claims = value as Record<string, unknown>;
  return (
    typeof claims.accountId === "string" &&
    claims.accountId.length > 0 &&
    typeof claims.issuedAt === "number" &&
    typeof claims.expiresAt === "number"
  );
}

/**
 * The claims of a token this server signed and that has not expired, or
 * `null` for anything else — a malformed, tampered or expired token is
 * simply "not logged in".
 */
export async function verifySession(
  token: string,
  secret: string,
  now: Date,
): Promise<SessionClaims | null> {
  const [body, signature, ...rest] = token.split(".");
  if (body === undefined || signature === undefined || rest.length > 0) {
    return null;
  }
  const signatureBytes = fromBase64Url(signature);
  const bodyBytes = fromBase64Url(body);
  if (signatureBytes === null || bodyBytes === null) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signatureBytes,
    encoder.encode(body),
  );
  if (!valid) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(decoder.decode(bodyBytes));
  } catch {
    return null;
  }
  if (!isClaims(claims) || claims.expiresAt <= now.getTime()) return null;
  return claims;
}
