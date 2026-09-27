import {
  createPendingExternalLogin,
  ExternalLoginProof,
  type PendingExternalLogin,
} from "@repo/core/application/account/externalLogin";
import { SystemError } from "@repo/core/application/errors";
import { ExternalProviderKey } from "@repo/core/domain/account/externalIdentity";
import { encodeBase64UrlJson } from "@repo/core/lib/crypto";
import { describe, expect, it } from "vitest";
import { GoogleOidcProvider, type OidcFetch } from "../googleOidc";

const CLIENT_ID = "client-id.apps.example";
const REDIRECT = "http://localhost:3000/login/external/google/callback";

type TokenAnswer =
  | Readonly<{ kind: "throw" }>
  | Readonly<{ kind: "respond"; status: number; body: unknown }>
  | Readonly<{ kind: "idToken"; claims: (nonce: string) => object }>;

let issuers = 0;

/**
 * A Google stand-in reached through the injected fetch: discovery for a
 * fresh issuer (the discovery cache is per issuer), and a token endpoint
 * answering as told.
 */
function provider(token: TokenAnswer) {
  issuers += 1;
  const issuer = new URL(`https://idp${issuers}.example.test`);
  const tokenEndpoint = `${issuer.origin}/token`;
  let nonce = "";
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetch: OidcFetch = async (url) => {
    if (url.endsWith("/.well-known/openid-configuration")) {
      return json(200, {
        issuer: issuer.href.replace(/\/$/, ""),
        authorization_endpoint: `${issuer.origin}/auth`,
        token_endpoint: tokenEndpoint,
      });
    }
    if (url === tokenEndpoint) {
      if (token.kind === "throw") throw new TypeError("fetch failed");
      if (token.kind === "respond") return json(token.status, token.body);
      const now = Math.floor(Date.now() / 1000);
      const idToken = [
        encodeBase64UrlJson({ alg: "RS256", typ: "JWT" }),
        encodeBase64UrlJson({
          iss: issuer.href.replace(/\/$/, ""),
          aud: CLIENT_ID,
          sub: "subject-1",
          iat: now,
          exp: now + 300,
          ...token.claims(nonce),
        }),
        "c2lnbmF0dXJl",
      ].join(".");
      return json(200, {
        access_token: "access",
        token_type: "Bearer",
        expires_in: 300,
        id_token: idToken,
      });
    }
    return new Response("not found", { status: 404 });
  };
  const google = new GoogleOidcProvider(
    { clientId: CLIENT_ID, clientSecret: "secret" },
    { issuer: new URL(issuer.href.replace(/\/$/, "")), fetch },
  );
  const pending: PendingExternalLogin = createPendingExternalLogin(
    ExternalProviderKey.create("google"),
    REDIRECT,
  );
  nonce = pending.nonce;
  const verify = (callbackQuery: string) => {
    const proof = ExternalLoginProof.decode(
      ExternalLoginProof.encode(pending, callbackQuery),
    );
    if (proof === null) throw new Error("not a proof");
    return google.verify(proof);
  };
  return { google, pending, verify };
}

const withCode = (p: PendingExternalLogin) => `?code=abc&state=${p.state}`;

describe("GoogleOidcProvider", () => {
  it("treats a cancel, a state mismatch and a missing code as not authenticated", async () => {
    const { pending, verify } = provider({ kind: "throw" });
    for (const query of [
      `?error=access_denied&state=${pending.state}`,
      `?code=abc&state=another-${pending.state}`,
      `?state=${pending.state}`,
    ]) {
      expect(await verify(query)).toEqual({ outcome: "not_authenticated" });
    }
  });

  it("reports the provider's own failures as SystemError, not as not authenticated", async () => {
    const { pending, verify } = provider({ kind: "throw" });
    for (const error of ["server_error", "temporarily_unavailable"]) {
      await expect(
        verify(`?error=${error}&state=${pending.state}`),
      ).rejects.toMatchObject({
        name: "SystemError",
        code: "EXTERNAL_API_ERROR",
      });
    }
  });

  it("reports a failed token request as a network SystemError", async () => {
    const { pending, verify } = provider({ kind: "throw" });
    await expect(verify(withCode(pending))).rejects.toMatchObject({
      name: "SystemError",
      code: "NETWORK_ERROR",
    });
  });

  it("reports a 5xx from the token endpoint as SystemError", async () => {
    for (const body of [
      { error: "server_error" },
      { error: "invalid_grant" },
      "unavailable",
    ]) {
      const { pending, verify } = provider({
        kind: "respond",
        status: 503,
        body,
      });
      const error = await verify(withCode(pending)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SystemError);
      expect(error).toMatchObject({ code: "EXTERNAL_API_ERROR" });
    }
  });

  it("treats a rejected code (invalid_grant) as not authenticated", async () => {
    const { pending, verify } = provider({
      kind: "respond",
      status: 400,
      body: { error: "invalid_grant" },
    });
    expect(await verify(withCode(pending))).toEqual({
      outcome: "not_authenticated",
    });
  });

  it("answers the verified address only when the provider verified it", async () => {
    const verified = provider({
      kind: "idToken",
      claims: (nonce) => ({
        nonce,
        email: " Hanako@Example.COM ",
        email_verified: true,
      }),
    });
    expect(await verified.verify(withCode(verified.pending))).toEqual({
      outcome: "verified",
      email: "hanako@example.com",
    });
    for (const claims of [
      (nonce: string) => ({
        nonce,
        email: "a@example.com",
        email_verified: false,
      }),
      (nonce: string) => ({ nonce }),
    ]) {
      const other = provider({ kind: "idToken", claims });
      expect(await other.verify(withCode(other.pending))).toEqual({
        outcome: "email_unavailable",
      });
    }
  });

  it("treats an ID token of another attempt (nonce) as not authenticated", async () => {
    const { pending, verify } = provider({
      kind: "idToken",
      claims: () => ({
        nonce: "another-attempt",
        email: "a@example.com",
        email_verified: true,
      }),
    });
    expect(await verify(withCode(pending))).toEqual({
      outcome: "not_authenticated",
    });
  });
});
