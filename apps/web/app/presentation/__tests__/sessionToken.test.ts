import { describe, expect, it } from "vitest";
import { SESSION_TTL_MS, signSession, verifySession } from "../sessionToken";

const SECRET = "a-test-secret-that-is-long-enough-000";
const NOW = new Date("2026-09-28T00:00:00.000Z");
const claims = {
  accountId: "ffffffff-ffff-7fff-8fff-000000000001",
  issuedAt: NOW.getTime(),
  expiresAt: NOW.getTime() + SESSION_TTL_MS,
};

describe("session token", () => {
  it("round-trips the claims it signed", async () => {
    const token = await signSession(claims, SECRET);
    expect(await verifySession(token, SECRET, NOW)).toEqual(claims);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession(claims, `${SECRET}-other`);
    expect(await verifySession(token, SECRET, NOW)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signSession(claims, SECRET);
    const [, signature] = token.split(".");
    const forged = btoa(
      JSON.stringify({ ...claims, accountId: "someone-else" }),
    ).replace(/=+$/, "");
    expect(
      await verifySession(`${forged}.${signature}`, SECRET, NOW),
    ).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signSession(claims, SECRET);
    expect(
      await verifySession(token, SECRET, new Date(claims.expiresAt)),
    ).toBeNull();
  });

  it("rejects malformed values", async () => {
    for (const token of ["", "abc", "a.b.c", "!!.??", "e30.e30"]) {
      expect(await verifySession(token, SECRET, NOW)).toBeNull();
    }
  });
});
