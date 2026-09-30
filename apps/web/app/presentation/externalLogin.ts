// Server-only: import from server route handlers (dynamically), never from
// components.
import { ExternalLoginProof } from "@repo/core/application/account/externalLogin";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import { AccountErrorCode } from "@repo/core/domain/account/errorCode";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";
import { startSession } from "./actor";
import { serializeError } from "./errorResponse";
import {
  EXTERNAL_LOGIN_COOKIE,
  EXTERNAL_LOGIN_COOKIE_PATH,
  EXTERNAL_LOGIN_TTL_MS,
  signExternalLoginState,
  verifyExternalLoginState,
} from "./externalLoginState";
import type { ExternalLoginFailure } from "./login";
import { loginDonePath, safeNextPath } from "./nextPath";

/** The callback route of `provider`, as the provider must redirect to it. */
export function externalLoginCallbackUrl(
  appUrl: string,
  provider: string,
): string {
  return new URL(
    `${EXTERNAL_LOGIN_COOKIE_PATH}/${encodeURIComponent(provider)}/callback`,
    appUrl,
  ).toString();
}

function redirectTo(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

/** Back to MY-02's input state with the failure shown and `next` kept. */
function backToLogin(failure: ExternalLoginFailure, next: string): Response {
  const search = new URLSearchParams({ external: failure });
  if (next !== safeNextPath(undefined)) search.set("next", next);
  return redirectTo(`/login?${search.toString()}`);
}

function cookieOptions(container: RequestContainer) {
  return {
    httpOnly: true,
    secure: new URL(container.config.appUrl).protocol === "https:",
    sameSite: "lax" as const,
    path: EXTERNAL_LOGIN_COOKIE_PATH,
  };
}

function logFailure(
  container: RequestContainer,
  message: string,
  error: unknown,
): void {
  const serialized = serializeError(error);
  if (serialized.kind === "system" || serialized.kind === "unknown") {
    container.logger.error(message, {
      kind: serialized.kind,
      code: serialized.code,
      message: serialized.message,
      cause: error,
    });
  }
}

/**
 * `GET /login/external/$provider?next=…`: starts the provider's login and
 * sends the browser there, keeping the pending login in a signed cookie.
 */
export async function startExternalLogin(
  request: Request,
  provider: string,
): Promise<Response> {
  const container = await getContainer();
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  const { beginExternalLogin } = await import(
    "@repo/core/application/account/beginExternalLogin"
  );
  let begun: Awaited<ReturnType<typeof beginExternalLogin>>;
  try {
    begun = await beginExternalLogin({
      container,
      input: {
        provider,
        redirectUri: externalLoginCallbackUrl(
          container.config.appUrl,
          provider,
        ),
      },
    });
  } catch (error) {
    logFailure(container, "External login could not start", error);
    return backToLogin("failed", next);
  }
  const token = await signExternalLoginState(
    {
      pending: begun.pending,
      next,
      expiresAt: container.clock.now().getTime() + EXTERNAL_LOGIN_TTL_MS,
    },
    container.runtime.sessionSecret,
  );
  setCookie(EXTERNAL_LOGIN_COOKIE, token, {
    ...cookieOptions(container),
    maxAge: Math.floor(EXTERNAL_LOGIN_TTL_MS / 1000),
  });
  return redirectTo(begun.authorizationUrl);
}

function failureOf(error: unknown): ExternalLoginFailure {
  const serialized = serializeError(error);
  return serialized.kind === "business" &&
    serialized.code === AccountErrorCode.VerifiedEmailRequired
    ? "no_email"
    : "failed";
}

/**
 * `GET /login/external/$provider/callback?…`: proves the provider's answer
 * against the pending login in the cookie, logs the browser in and sends it
 * to MY-02's last step (`/login/done`), which merges the device saves as
 * the other logins do and returns to `next`. Every failure lands on
 * MY-02's input state.
 */
export async function completeExternalLogin(
  request: Request,
  provider: string,
): Promise<Response> {
  const container = await getContainer();
  const token = getCookie(EXTERNAL_LOGIN_COOKIE);
  deleteCookie(EXTERNAL_LOGIN_COOKIE, cookieOptions(container));
  const state =
    token === undefined
      ? null
      : await verifyExternalLoginState(
          token,
          container.runtime.sessionSecret,
          container.clock.now(),
        );
  if (state === null || state.pending.provider !== provider) {
    return backToLogin("failed", safeNextPath(undefined));
  }
  const { loginWithExternalAccount } = await import(
    "@repo/core/application/account/loginWithExternalAccount"
  );
  try {
    const { accountId } = await loginWithExternalAccount({
      container,
      input: {
        provider,
        proof: ExternalLoginProof.encode(
          state.pending,
          new URL(request.url).search,
        ),
      },
    });
    await startSession(container, accountId);
  } catch (error) {
    logFailure(container, "External login failed", error);
    return backToLogin(failureOf(error), state.next);
  }
  return redirectTo(loginDonePath(state.next));
}
