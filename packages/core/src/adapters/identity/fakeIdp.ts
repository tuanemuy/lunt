import type {
  ExternalLoginProof,
  PendingExternalLogin,
} from "@repo/core/application/account/externalLogin";
import { pkceChallenge } from "@repo/core/application/account/externalLogin";
import type {
  FakeIdp,
  FakeIdpChoice,
  FakeIdpRequest,
} from "@repo/core/application/dev/fakeIdp";
import type { Clock } from "@repo/core/application/ports/clock";
import type { ExternalIdentity } from "@repo/core/domain/account/externalIdentity";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import {
  decodeBase64UrlJson,
  encodeBase64UrlJson,
  hmacSha256,
  timingSafeEqual,
} from "@repo/core/lib/crypto";
import { z } from "zod";
import type { ExternalIdentityProvider } from "./providers";

/**
 * Development fake provider (design.md D-07). The login flow is the real
 * one — authorization URL, callback, proof, verification — with the
 * provider's screen replaced by the app's own `/__dev/idp/authorize`.
 *
 * That page receives the usual OIDC authorization request (see
 * `fakeIdpAuthorizeRequestSchema`), lets the developer pick an outcome,
 * and redirects to `fakeIdpCallbackUrl(...)`: a signed one-time `code`
 * carrying the outcome, or `error=access_denied` for a cancel — the same
 * callback shapes Google produces.
 */
export const FAKE_IDP_AUTHORIZE_PATH = "/__dev/idp/authorize";
export const FAKE_IDP_CLIENT_ID = "lunt-development";

/** How long a fake code stays redeemable. */
const CODE_TTL_MS = 5 * 60 * 1000;

export type { FakeIdpChoice };

/** The signed content of a fake authorization code. */
export type FakeIdpGrant = Readonly<{
  outcome: "verified" | "unverified" | "no_email";
  email: string | null;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
  /** Epoch ms after which the code is refused. */
  expiresAt: number;
}>;

/** Query of `/__dev/idp/authorize` (validate it at the route). */
export const fakeIdpAuthorizeRequestSchema = z.object({
  client_id: z.literal(FAKE_IDP_CLIENT_ID),
  response_type: z.literal("code"),
  redirect_uri: z.url().max(2048),
  scope: z.string().max(256),
  state: z.string().min(1).max(512),
  nonce: z.string().min(1).max(512),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
});

export type FakeIdpAuthorizeRequest = z.infer<
  typeof fakeIdpAuthorizeRequestSchema
>;

const grantSchema = z.object({
  outcome: z.enum(["verified", "unverified", "no_email"]),
  email: z.string().max(320).nullable(),
  nonce: z.string().min(1),
  codeChallenge: z.string().min(1),
  redirectUri: z.string().min(1),
  expiresAt: z.number().int(),
});

const signingInput = (body: string) => `lunt/dev-idp/v1:${body}`;

/**
 * Signs a fake authorization code (`base64url(json).signature`) with the
 * server's key — pass `container.runtime.sessionSecret`.
 */
export async function signFakeIdpCode(
  secret: string,
  grant: FakeIdpGrant,
): Promise<string> {
  const body = encodeBase64UrlJson(grant);
  return `${body}.${await hmacSha256(secret, signingInput(body))}`;
}

/**
 * The grant of a code `signFakeIdpCode` signed with `secret` that has not
 * expired at `now`; `null` for anything else (tampered, foreign, expired,
 * malformed).
 */
export async function verifyFakeIdpCode(
  secret: string,
  code: string,
  now: Date,
): Promise<FakeIdpGrant | null> {
  const [body, signature, ...rest] = code.split(".");
  if (body === undefined || signature === undefined || rest.length > 0) {
    return null;
  }
  const expected = await hmacSha256(secret, signingInput(body));
  if (!timingSafeEqual(signature, expected)) return null;
  const parsed = grantSchema.safeParse(decodeBase64UrlJson(body));
  if (!parsed.success || parsed.data.expiresAt <= now.getTime()) return null;
  return parsed.data;
}

/**
 * Where the fake provider's screen sends the browser back to: the
 * request's `redirect_uri` with `code` and `state`, or with
 * `error=access_denied` and `state` when the developer cancels.
 */
export async function fakeIdpCallbackUrl(
  args: Readonly<{
    secret: string;
    now: Date;
    request: FakeIdpAuthorizeRequest;
    choice: FakeIdpChoice;
  }>,
): Promise<string> {
  const url = new URL(args.request.redirect_uri);
  if (args.choice.kind === "cancel") {
    url.searchParams.set("error", "access_denied");
  } else {
    const code = await signFakeIdpCode(args.secret, {
      outcome: args.choice.kind,
      email: args.choice.kind === "no_email" ? null : args.choice.email,
      nonce: args.request.nonce,
      codeChallenge: args.request.code_challenge,
      redirectUri: args.request.redirect_uri,
      expiresAt: args.now.getTime() + CODE_TTL_MS,
    });
    url.searchParams.set("code", code);
  }
  url.searchParams.set("state", args.request.state);
  return url.toString();
}

const NOT_AUTHENTICATED: ExternalIdentity = { outcome: "not_authenticated" };

/** The fake provider behind the `ExternalIdentityProviders` registry. */
export class FakeIdpProvider implements ExternalIdentityProvider {
  constructor(
    private readonly deps: Readonly<{
      secret: string;
      appUrl: string;
      clock: Clock;
    }>,
  ) {}

  async authorizationUrl(
    pending: PendingExternalLogin,
    codeChallenge: string,
  ): Promise<string> {
    const url = new URL(FAKE_IDP_AUTHORIZE_PATH, this.deps.appUrl);
    const request: FakeIdpAuthorizeRequest = {
      client_id: FAKE_IDP_CLIENT_ID,
      response_type: "code",
      redirect_uri: pending.redirectUri,
      scope: "openid email",
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    };
    for (const [key, value] of Object.entries(request)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  async verify(proof: ExternalLoginProof): Promise<ExternalIdentity> {
    const params = new URLSearchParams(proof.callbackQuery);
    const code = params.get("code");
    if (
      params.has("error") ||
      params.get("state") !== proof.state ||
      code === null
    ) {
      return NOT_AUTHENTICATED;
    }
    const grant = await verifyFakeIdpCode(
      this.deps.secret,
      code,
      this.deps.clock.now(),
    );
    if (
      grant === null ||
      grant.nonce !== proof.nonce ||
      grant.redirectUri !== proof.redirectUri ||
      grant.codeChallenge !== (await pkceChallenge(proof.codeVerifier))
    ) {
      return NOT_AUTHENTICATED;
    }
    if (grant.outcome !== "verified" || grant.email === null) {
      return { outcome: "email_unavailable" };
    }
    try {
      return { outcome: "verified", email: EmailAddress.create(grant.email) };
    } catch {
      return { outcome: "email_unavailable" };
    }
  }
}

/**
 * The fake provider's screen (`FakeIdp`): accepts an authorization
 * request only when it returns to `appUrl`'s origin, and signs its
 * answer with `secret`.
 */
export class FakeIdpScreen implements FakeIdp {
  constructor(
    private readonly options: Readonly<{ secret: string; appUrl: string }>,
  ) {}

  open(query: string): FakeIdpRequest | null {
    const parsed = fakeIdpAuthorizeRequestSchema.safeParse(
      Object.fromEntries(new URLSearchParams(query)),
    );
    if (!parsed.success) return null;
    const request = parsed.data;
    const returnsTo = new URL(request.redirect_uri);
    if (returnsTo.origin !== new URL(this.options.appUrl).origin) return null;
    return {
      returnsTo: returnsTo.pathname,
      answer: (choice, now) =>
        fakeIdpCallbackUrl({
          secret: this.options.secret,
          now,
          request,
          choice,
        }),
    };
  }
}
