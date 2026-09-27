import { safeNextPath } from "./nextPath";

const KEY = "lunt:login-return";
/** Longer than a login mail stays usable, so a late click still returns. */
const KEPT_FOR_MS = 60 * 60 * 1000;

type Stored = Readonly<{ next: string; savedAt: number }>;

function isStored(value: unknown): value is Stored {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.next === "string" && typeof record.savedAt === "number";
}

/**
 * Remembers, in this browser, where the login that is sending a mail
 * started — so opening the mail's link in the same browser returns there
 * (MY-02 「ログイン成立」). Browser storage may be unavailable; the link
 * then lands on MY-01, as it does in another browser.
 */
export function rememberLoginReturn(next: string | undefined): void {
  try {
    if (next === undefined) {
      window.localStorage.removeItem(KEY);
      return;
    }
    const stored: Stored = { next, savedAt: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked: the link falls back to MY-01.
  }
}

/**
 * The remembered return path, or `undefined`. Kept until a login succeeds
 * (`rememberLoginReturn(undefined)`), so an expired link opened first does
 * not lose it for the fresh one.
 */
export function readLoginReturn(): string | undefined {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isStored(parsed) || Date.now() - parsed.savedAt > KEPT_FOR_MS) {
      return undefined;
    }
    return safeNextPath(parsed.next);
  } catch {
    return undefined;
  }
}
