/** Where a finished login lands when there is no usable return path. */
export const DEFAULT_AFTER_LOGIN = "/me";

const MAX_LENGTH = 2048;

/**
 * The return path after login (CS-04), accepted only as a same-origin
 * absolute path: `/…` but not `//…` or `/\…` (protocol-relative, which
 * browsers resolve to another host), without control characters, and not
 * the login screens (`/login` and everything under it). Anything else falls
 * back to MY-01 — an open redirect would let a crafted link send a freshly
 * logged-in user to another site, and a return to `/login/link?token=…`
 * would log them straight into an account the link's sender chose.
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
  if (url.origin !== "http://lunt.invalid" || isLoginPath(url.pathname)) {
    return DEFAULT_AFTER_LOGIN;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * MY-02's last step for a login the server finished (`/login/done`): it
 * merges the device saves, then goes on to `next` (made safe first).
 */
export function loginDonePath(next: unknown): string {
  return `/login/done?${new URLSearchParams({ next: safeNextPath(next) }).toString()}`;
}

/**
 * `/login` or a path under it, compared the way the router matches paths:
 * case-insensitively and with percent-encoding decoded.
 */
function isLoginPath(pathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  const path = decoded.toLowerCase();
  return path === "/login" || path.startsWith("/login/");
}
