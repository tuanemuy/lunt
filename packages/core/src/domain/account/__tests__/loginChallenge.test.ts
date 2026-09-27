import {
  catchError,
  expectBusinessError,
} from "@repo/core/domain/common/__tests__/expectBusinessError";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { isRehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import {
  LoginChallenge,
  LoginChallengeId,
  type PendingLoginChallenge,
} from "../loginChallenge";
import { SecretDigest } from "../loginSecret";

const NOW = new Date("2026-09-28T00:00:00.000Z");
const TTL = 15 * 60 * 1000;
const LINK = SecretDigest.create("link-digest");
const CODE = SecretDigest.create("code-digest");
const WRONG = SecretDigest.create("wrong-digest");
const INVALID = "ACCOUNT_LOGIN_CHALLENGE_INVALID";

const issue = (): PendingLoginChallenge =>
  LoginChallenge.issue(
    {
      id: LoginChallengeId.create("ffffffff-ffff-7fff-8fff-000000000001"),
      email: EmailAddress.create("a@example.com"),
      linkTokenDigest: LINK,
      codeDigest: CODE,
      validForMs: TTL,
    },
    NOW,
  );

const justBeforeExpiry = new Date(NOW.getTime() + TTL - 1);
const atExpiry = new Date(NOW.getTime() + TTL);

describe("LoginChallenge", () => {
  it("issue makes a pending challenge that expires validForMs later", () => {
    expect(issue()).toEqual({
      id: "ffffffff-ffff-7fff-8fff-000000000001",
      email: "a@example.com",
      linkTokenDigest: LINK,
      codeDigest: CODE,
      expiresAt: atExpiry,
      version: 0,
      status: "pending",
      failedCodeAttempts: 0,
    });
  });

  it("issue refuses a non-positive or fractional validForMs", () => {
    for (const validForMs of [0, -1, 1.5]) {
      expectBusinessError(
        () => LoginChallenge.issue({ ...issue(), validForMs }, NOW),
        "COMMON_INVALID_INPUT",
      );
    }
  });

  it("redeemByLink redeems a usable challenge with the matching digest", () => {
    const redeemed = LoginChallenge.redeemByLink(
      issue(),
      LINK,
      justBeforeExpiry,
    );
    expect(redeemed.status).toBe("redeemed");
    expect(redeemed.version).toBe(1);
    expect("failedCodeAttempts" in redeemed).toBe(false);
  });

  it("redeemByLink refuses a missing, expired, closed or mismatched challenge alike", () => {
    const pending = issue();
    const redeemed = LoginChallenge.redeemByLink(pending, LINK, NOW);
    const exhausted = LoginChallenge.redeemByCode(pending, WRONG, 1, NOW);
    for (const attempt of [
      () => LoginChallenge.redeemByLink(null, LINK, NOW),
      () => LoginChallenge.redeemByLink(pending, LINK, atExpiry),
      () => LoginChallenge.redeemByLink(redeemed, LINK, NOW),
      () => LoginChallenge.redeemByLink(exhausted.challenge, LINK, NOW),
      () => LoginChallenge.redeemByLink(pending, CODE, NOW),
    ]) {
      expectBusinessError(attempt, INVALID);
    }
  });

  it("redeemByCode redeems on the matching code", () => {
    const result = LoginChallenge.redeemByCode(issue(), CODE, 3, NOW);
    expect(result.outcome).toBe("redeemed");
    expect(result.challenge.status).toBe("redeemed");
  });

  it("redeemByCode counts a wrong code and answers the mismatch without throwing", () => {
    const result = LoginChallenge.redeemByCode(issue(), WRONG, 3, NOW);
    expect(result.outcome).toBe("mismatch");
    expect(result.challenge).toMatchObject({
      status: "pending",
      failedCodeAttempts: 1,
      version: 1,
    });
    if (result.outcome !== "mismatch") throw new Error("expected mismatch");
    expect(result.error.code).toBe("ACCOUNT_LOGIN_CODE_MISMATCH");
  });

  it("redeemByCode exhausts the challenge when the attempts reach the limit", () => {
    let challenge: ReturnType<typeof LoginChallenge.redeemByCode>["challenge"] =
      issue();
    challenge = LoginChallenge.redeemByCode(challenge, WRONG, 3, NOW).challenge;
    challenge = LoginChallenge.redeemByCode(challenge, WRONG, 3, NOW).challenge;
    const last = LoginChallenge.redeemByCode(challenge, WRONG, 3, NOW);
    expect(last.challenge.status).toBe("exhausted");
    if (last.outcome !== "mismatch") throw new Error("expected mismatch");
    expect(last.error.code).toBe(INVALID);
    expectBusinessError(
      () => LoginChallenge.redeemByCode(last.challenge, CODE, 3, NOW),
      INVALID,
    );
    expectBusinessError(
      () => LoginChallenge.redeemByLink(last.challenge, LINK, NOW),
      INVALID,
    );
  });

  it("redeemByCode refuses an unusable challenge before comparing, leaving the count", () => {
    expectBusinessError(
      () => LoginChallenge.redeemByCode(issue(), WRONG, 3, atExpiry),
      INVALID,
    );
    expectBusinessError(
      () => LoginChallenge.redeemByCode(null, CODE, 3, NOW),
      INVALID,
    );
    expectBusinessError(
      () => LoginChallenge.redeemByCode(issue(), CODE, 0, NOW),
      "COMMON_INVALID_INPUT",
    );
  });

  it("isReplayOf compares the address", () => {
    expect(
      LoginChallenge.isReplayOf(issue(), EmailAddress.create("A@example.com")),
    ).toBe(true);
    expect(
      LoginChallenge.isReplayOf(issue(), EmailAddress.create("b@example.com")),
    ).toBe(false);
  });

  it("reconstruct round-trips every state through its snapshot", () => {
    const pending = issue();
    const redeemed = LoginChallenge.redeemByLink(pending, LINK, NOW);
    const exhausted = LoginChallenge.redeemByCode(
      pending,
      WRONG,
      1,
      NOW,
    ).challenge;
    for (const challenge of [pending, redeemed, exhausted]) {
      expect(
        LoginChallenge.reconstruct(LoginChallenge.snapshot(challenge)),
      ).toEqual(challenge);
    }
  });

  it("reconstruct refuses stored values that break the invariants", () => {
    const good = LoginChallenge.snapshot(issue());
    for (const bad of [
      { ...good, status: "used" },
      { ...good, failedCodeAttempts: null },
      { ...good, failedCodeAttempts: -1 },
      { ...good, email: "A@example.com" },
      { ...good, linkTokenDigest: "" },
      { ...good, expiresAt: new Date(Number.NaN) },
      { ...good, version: -1 },
    ]) {
      expect(
        isRehydrationError(catchError(() => LoginChallenge.reconstruct(bad))),
      ).toBe(true);
    }
  });
});
