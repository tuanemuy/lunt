/** Where a finished login lands when there is no usable return path. */
export const DEFAULT_AFTER_LOGIN = "/me";

const MAX_LENGTH = 2048;

/**
 * The return path after login (CS-04), accepted only as a same-origin
 * absolute path: `/…` but not `//…` or `/\…` (protocol-relative, which
 * browsers resolve to another host), without control characters, and not
 * the login screen itself. Anything else falls back to MY-01 — an open
 * redirect would let a crafted link send a freshly logged-in user to
 * another site.
 */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) {
    return DEFAULT_AFTER_LOGIN;
  }
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) {
    return DEFAULT_AFTER_LOGIN;
  }
  const url = new URL(raw, "http://lunt.invalid");
  if (url.origin !== "http://lunt.invalid" || url.pathname === "/login") {
    return DEFAULT_AFTER_LOGIN;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
