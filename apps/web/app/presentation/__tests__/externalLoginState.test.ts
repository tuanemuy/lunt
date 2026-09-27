import { describe, expect, it } from "vitest";
import {
  EXTERNAL_LOGIN_TTL_MS,
  type ExternalLoginState,
  signExternalLoginState,
  verifyExternalLoginState,
} from "../externalLoginState";

const SECRET = "a-test-secret-that-is-long-enough-000";
const NOW = new Date("2026-09-28T00:00:00.000Z");
const state: ExternalLoginState = {
  pending: {
    provider: "google",
    state: "s".repeat(43),
    nonce: "n".repeat(43),
    codeVerifier: "v".repeat(43),
    redirectUri: "http://localhost:3000/login/external/google/callback",
  },
  next: "/me/withdraw",
  expiresAt: NOW.getTime() + EXTERNAL_LOGIN_TTL_MS,
};

describe("external login state", () => {
  it("round-trips the state it signed", async () => {
    const token = await signExternalLoginState(state, SECRET);
    expect(await verifyExternalLoginState(token, SECRET, NOW)).toEqual(state);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signExternalLoginState(state, `${SECRET}-other`);
    expect(await verifyExternalLoginState(token, SECRET, NOW)).toBeNull();
  });

  it("rejects a state whose body was swapped", async () => {
    const token = await signExternalLoginState(state, SECRET);
    const other = await signExternalLoginState(
      { ...state, next: "/ops/roles" },
      SECRET,
    );
    const [, signature] = token.split(".");
    const [body] = other.split(".");
    expect(
      await verifyExternalLoginState(`${body}.${signature}`, SECRET, NOW),
    ).toBeNull();
  });

  it("rejects an expired state", async () => {
    const token = await signExternalLoginState(state, SECRET);
    const later = new Date(state.expiresAt);
    expect(await verifyExternalLoginState(token, SECRET, later)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifyExternalLoginState("", SECRET, NOW)).toBeNull();
    expect(await verifyExternalLoginState("a.b.c", SECRET, NOW)).toBeNull();
  });

  it("rejects a signed value that is not a pending login", async () => {
    const token = await signExternalLoginState(
      { ...state, pending: { ...state.pending, codeVerifier: "short" } },
      SECRET,
    );
    expect(await verifyExternalLoginState(token, SECRET, NOW)).toBeNull();
  });
});
