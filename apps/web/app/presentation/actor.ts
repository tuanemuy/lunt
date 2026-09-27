// Server-only: import from server-function handlers (dynamically) or
// other server-only modules, never from components.
import type { RequestContainer } from "@repo/core/application/di/types";
import { UnauthorizedError } from "@repo/core/application/errors";
import type { Actor } from "@repo/core/domain/common/actor";
import { AccountId } from "@repo/core/domain/common/ids";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";
import { SESSION_TTL_MS, signSession, verifySession } from "./sessionToken";

export const SESSION_COOKIE = "lunt_session";

const resolved = new WeakMap<RequestContainer, Promise<Actor | null>>();

function parseAccountId(raw: string): AccountId | null {
  try {
    return AccountId.create(raw);
  } catch {
    return null;
  }
}

async function resolve(container: RequestContainer): Promise<Actor | null> {
  const token = getCookie(SESSION_COOKIE);
  if (token === undefined) return null;
  const claims = await verifySession(
    token,
    container.runtime.sessionSecret,
    container.clock.now(),
  );
  const accountId = claims === null ? null : parseAccountId(claims.accountId);
  if (accountId === null) {
    deleteCookie(SESSION_COOKIE, { path: "/" });
    return null;
  }
  // `spec/domains/index.md` 「操作する人」: the account must exist — a
  // withdrawn account's session is treated as not logged in.
  const found = await container.unitOfWorkProvider.run(
    ({ accountRepository }) => accountRepository.findById(accountId),
  );
  if (found === null) {
    deleteCookie(SESSION_COOKIE, { path: "/" });
    return null;
  }
  return { accountId: found.entity.id };
}

/**
 * The `Actor` boundary: the logged-in account of this request, or `null`.
 * Reads the account once per request (the container is per request).
 */
export function resolveActor(
  container: RequestContainer,
): Promise<Actor | null> {
  const cached = resolved.get(container);
  if (cached !== undefined) return cached;
  const pending = resolve(container);
  resolved.set(container, pending);
  return pending;
}

/** `resolveActor`, or `UnauthorizedError` (CS-04) when not logged in. */
export async function requireActor(
  container: RequestContainer,
): Promise<Actor> {
  const actor = await resolveActor(container);
  if (actor === null) {
    throw new UnauthorizedError("LOGIN_REQUIRED", "Login required");
  }
  return actor;
}

/**
 * Makes this browser logged in as `accountId` — a new login replaces the
 * previous one (account switching, `spec/pages/index.md` MY-02).
 */
export async function startSession(
  container: RequestContainer,
  accountId: AccountId,
): Promise<void> {
  const now = container.clock.now().getTime();
  const token = await signSession(
    { accountId, issuedAt: now, expiresAt: now + SESSION_TTL_MS },
    container.runtime.sessionSecret,
  );
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(container.config.appUrl).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  resolved.set(container, Promise.resolve({ accountId }));
}

/** Forget this browser's login (after withdrawal, and the development sign-out). */
export function endSession(container: RequestContainer): void {
  deleteCookie(SESSION_COOKIE, { path: "/" });
  resolved.set(container, Promise.resolve(null));
}
