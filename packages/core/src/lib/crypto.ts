// WebCrypto and base64url helpers shared by adapters and codecs. Work the
// same in Workers and Node.

/** Unpadded base64url (RFC 4648 §5). */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** The bytes of an unpadded base64url string, or `null` if it is not one. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
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

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeBase64UrlJson(value: unknown): string {
  return toBase64Url(encoder.encode(JSON.stringify(value)));
}

/** The JSON value encoded in `text`, or `null` for anything malformed. */
export function decodeBase64UrlJson(text: string): unknown {
  const bytes = fromBase64Url(text);
  if (bytes === null) return null;
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
}

/** HMAC-SHA-256 of `message` under `secret`, base64url. */
export async function hmacSha256(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return toBase64Url(new Uint8Array(signature));
}

/** SHA-256 of `message`, base64url. */
export async function sha256(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(message));
  return toBase64Url(new Uint8Array(digest));
}

/** Compares two strings without exiting early on the first difference. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
