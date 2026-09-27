import {
  createPendingExternalLogin,
  ExternalLoginProof,
  PendingExternalLogin,
  pkceChallenge,
} from "@repo/core/application/account/externalLogin";
import { ExternalProviderKey } from "@repo/core/domain/account/externalIdentity";
import { describe, expect, it } from "vitest";
import {
  type FakeIdpGrant,
  fakeIdpAuthorizeRequestSchema,
  fakeIdpCallbackUrl,
  signFakeIdpCode,
  verifyFakeIdpCode,
} from "../fakeIdp";

const SECRET = "fake-idp-test-secret-000000000000000";
const NOW = new Date("2026-09-28T00:00:00.000Z");
const GRANT: FakeIdpGrant = {
  outcome: "verified",
  email: "a@example.com",
  nonce: "n",
  codeChallenge: "c",
  redirectUri: "http://localhost:3000/cb",
  expiresAt: NOW.getTime() + 1000,
};

describe("fake provider codes", () => {
  it("verifies what it signed until it expires", async () => {
    const code = await signFakeIdpCode(SECRET, GRANT);
    expect(await verifyFakeIdpCode(SECRET, code, NOW)).toEqual(GRANT);
    expect(
      await verifyFakeIdpCode(SECRET, code, new Date(GRANT.expiresAt)),
    ).toBeNull();
  });

  it("refuses foreign, tampered and malformed codes", async () => {
    const code = await signFakeIdpCode(SECRET, GRANT);
    const [body, signature] = code.split(".");
    const otherBody = await signFakeIdpCode(SECRET, {
      ...GRANT,
      email: "b@example.com",
    });
    for (const bad of [
      await signFakeIdpCode("another-secret-00000000000000000000", GRANT),
      `${otherBody.split(".")[0]}.${signature}`,
      `${body}.${signature}.x`,
      body ?? "",
      "",
    ]) {
      expect(await verifyFakeIdpCode(SECRET, bad, NOW)).toBeNull();
    }
  });

  it("builds the callback: a code and the state, or access_denied on cancel", async () => {
    const pending = createPendingExternalLogin(
      ExternalProviderKey.create("google"),
      "http://localhost:3000/login/external/google/callback",
    );
    const request = fakeIdpAuthorizeRequestSchema.parse({
      client_id: "lunt-development",
      response_type: "code",
      redirect_uri: pending.redirectUri,
      scope: "openid email",
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: await pkceChallenge(pending.codeVerifier),
      code_challenge_method: "S256",
    });
    const granted = new URL(
      await fakeIdpCallbackUrl({
        secret: SECRET,
        now: NOW,
        request,
        choice: { kind: "no_email" },
      }),
    );
    expect(granted.origin + granted.pathname).toBe(pending.redirectUri);
    expect(granted.searchParams.get("state")).toBe(pending.state);
    const grant = await verifyFakeIdpCode(
      SECRET,
      granted.searchParams.get("code") ?? "",
      NOW,
    );
    expect(grant).toMatchObject({ outcome: "no_email", email: null });

    const cancelled = new URL(
      await fakeIdpCallbackUrl({
        secret: SECRET,
        now: NOW,
        request,
        choice: { kind: "cancel" },
      }),
    );
    expect(cancelled.searchParams.get("error")).toBe("access_denied");
    expect(cancelled.searchParams.has("code")).toBe(false);
  });
});

describe("external login proof", () => {
  it("round-trips the pending attempt and the callback query", () => {
    const pending = createPendingExternalLogin(
      ExternalProviderKey.create("google"),
      "http://localhost:3000/cb",
    );
    const proof = ExternalLoginProof.encode(pending, "?code=abc&state=s");
    expect(ExternalLoginProof.decode(proof)).toEqual({
      ...pending,
      callbackQuery: "?code=abc&state=s",
    });
    expect(
      PendingExternalLogin.parse(JSON.parse(JSON.stringify(pending))),
    ).toEqual(pending);
  });

  it("refuses anything encode did not produce", () => {
    for (const bad of ["", "not-base64!", btoa("{}"), "e30"]) {
      expect(ExternalLoginProof.decode(bad)).toBeNull();
    }
    expect(PendingExternalLogin.parse({ provider: "google" })).toBeNull();
  });

  it("mints fresh state, nonce and verifier per attempt", () => {
    const key = ExternalProviderKey.create("google");
    const a = createPendingExternalLogin(key, "http://localhost:3000/cb");
    const b = createPendingExternalLogin(key, "http://localhost:3000/cb");
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
