import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import { AccountErrorCode } from "./errorCode";
import { SecretDigest } from "./loginSecret";

declare const loginChallengeIdBrand: unique symbol;

/**
 * Chosen by the browser that asked for the login mail and sent again with
 * the code. Opaque; its format is the `IdGenerator`'s.
 */
export type LoginChallengeId = string & {
  readonly [loginChallengeIdBrand]: true;
};

export const LoginChallengeId = {
  /** `COMMON_INVALID_INPUT` on a blank string. */
  create: (raw: string): LoginChallengeId => {
    if (raw.trim().length === 0) {
      throw new BusinessRuleError(
        CommonErrorCode.InvalidInput,
        "Invalid login challenge id",
      );
    }
    return raw as LoginChallengeId;
  },
};

type LoginChallengeBase = Readonly<{
  id: LoginChallengeId;
  email: EmailAddress;
  linkTokenDigest: SecretDigest;
  codeDigest: SecretDigest;
  expiresAt: Date;
  version: Version;
}>;

export type PendingLoginChallenge = LoginChallengeBase &
  Readonly<{
    status: "pending";
    /** Wrong codes entered so far: an integer ≥ 0, below `maxCodeAttempts`. */
    failedCodeAttempts: number;
  }>;
export type RedeemedLoginChallenge = LoginChallengeBase &
  Readonly<{ status: "redeemed" }>;
export type ExhaustedLoginChallenge = LoginChallengeBase &
  Readonly<{ status: "exhausted" }>;

/**
 * One login mail's pair of one-time secrets, kept as digests only
 * (`spec/domains/account.md` 「LoginChallenge」). Usable while `pending`
 * and before `expiresAt`; redeeming it by link or by code closes both.
 */
export type LoginChallenge =
  | PendingLoginChallenge
  | RedeemedLoginChallenge
  | ExhaustedLoginChallenge;

export type LoginChallengeStatus = LoginChallenge["status"];

/**
 * Outcome of entering a code. A mismatch is not thrown: the usecase saves
 * `challenge` (one more failed attempt, or `exhausted`), commits, and only
 * then throws `error`.
 */
export type CodeRedemption =
  | Readonly<{ outcome: "redeemed"; challenge: RedeemedLoginChallenge }>
  | Readonly<{
      outcome: "mismatch";
      challenge: PendingLoginChallenge | ExhaustedLoginChallenge;
      error: BusinessRuleError<AccountErrorCode>;
    }>;

const invalid = (): BusinessRuleError<AccountErrorCode> =>
  new BusinessRuleError(
    AccountErrorCode.LoginChallengeInvalid,
    "The login link or code is no longer valid",
  );

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BusinessRuleError(
      CommonErrorCode.InvalidInput,
      `${label} must be a positive integer`,
    );
  }
}

function usable(
  challenge: LoginChallenge | null,
  now: Date,
): PendingLoginChallenge {
  if (
    challenge === null ||
    challenge.status !== "pending" ||
    now.getTime() >= challenge.expiresAt.getTime()
  ) {
    throw invalid();
  }
  return challenge;
}

function redeem(challenge: PendingLoginChallenge): RedeemedLoginChallenge {
  const { failedCodeAttempts: _, ...base } = challenge;
  return {
    ...base,
    status: "redeemed",
    version: Version.next(challenge.version),
  };
}

function issue(
  params: Readonly<{
    id: LoginChallengeId;
    email: EmailAddress;
    linkTokenDigest: SecretDigest;
    codeDigest: SecretDigest;
    validForMs: number;
  }>,
  now: Date,
): PendingLoginChallenge {
  assertPositiveInteger(params.validForMs, "validForMs");
  return {
    id: params.id,
    email: params.email,
    linkTokenDigest: params.linkTokenDigest,
    codeDigest: params.codeDigest,
    expiresAt: new Date(now.getTime() + params.validForMs),
    version: Version.initial(),
    status: "pending",
    failedCodeAttempts: 0,
  };
}

/**
 * Redeems by the mail's link. `challenge` is what the repository found for
 * the digest (`null` when nothing). Unknown, closed and expired challenges
 * all fail with the same `ACCOUNT_LOGIN_CHALLENGE_INVALID`.
 */
function redeemByLink(
  challenge: LoginChallenge | null,
  linkTokenDigest: SecretDigest,
  now: Date,
): RedeemedLoginChallenge {
  const pending = usable(challenge, now);
  if (!SecretDigest.equals(pending.linkTokenDigest, linkTokenDigest)) {
    throw invalid();
  }
  return redeem(pending);
}

/**
 * Redeems by the code typed in the browser that asked for the mail. A
 * wrong code counts one failed attempt; reaching `maxCodeAttempts` closes
 * the challenge as `exhausted` (I-18).
 */
function redeemByCode(
  challenge: LoginChallenge | null,
  codeDigest: SecretDigest,
  maxCodeAttempts: number,
  now: Date,
): CodeRedemption {
  assertPositiveInteger(maxCodeAttempts, "maxCodeAttempts");
  const pending = usable(challenge, now);
  if (SecretDigest.equals(pending.codeDigest, codeDigest)) {
    return { outcome: "redeemed", challenge: redeem(pending) };
  }
  const attempts = pending.failedCodeAttempts + 1;
  const version = Version.next(pending.version);
  if (attempts >= maxCodeAttempts) {
    const { failedCodeAttempts: _, ...base } = pending;
    return {
      outcome: "mismatch",
      challenge: { ...base, status: "exhausted", version },
      error: invalid(),
    };
  }
  return {
    outcome: "mismatch",
    challenge: { ...pending, failedCodeAttempts: attempts, version },
    error: new BusinessRuleError(
      AccountErrorCode.LoginCodeMismatch,
      "The login code does not match",
    ),
  };
}

/** Whether an issue request for an existing id is a resend of the same one. */
function isReplayOf(existing: LoginChallenge, email: EmailAddress): boolean {
  return EmailAddress.equals(existing.email, email);
}

export type LoginChallengeSnapshot = Readonly<{
  id: string;
  email: string;
  linkTokenDigest: string;
  codeDigest: string;
  expiresAt: Date;
  status: string;
  /** Present for `pending` only. */
  failedCodeAttempts: number | null;
  version: number;
}>;

function reconstruct(input: LoginChallengeSnapshot): LoginChallenge {
  try {
    const email = EmailAddress.create(input.email);
    if (email !== input.email) {
      throw new Error("Stored email is not in its normalized form");
    }
    if (Number.isNaN(input.expiresAt.getTime())) {
      throw new Error("Stored expiresAt is not a date");
    }
    const base: LoginChallengeBase = {
      id: LoginChallengeId.create(input.id),
      email,
      linkTokenDigest: SecretDigest.create(input.linkTokenDigest),
      codeDigest: SecretDigest.create(input.codeDigest),
      expiresAt: new Date(input.expiresAt.getTime()),
      version: Version.create(input.version),
    };
    switch (input.status) {
      case "pending": {
        const attempts = input.failedCodeAttempts;
        if (attempts === null || !Number.isInteger(attempts) || attempts < 0) {
          throw new Error("Stored failedCodeAttempts is not a count");
        }
        return { ...base, status: "pending", failedCodeAttempts: attempts };
      }
      case "redeemed":
        return { ...base, status: "redeemed" };
      case "exhausted":
        return { ...base, status: "exhausted" };
      default:
        throw new Error(`Unknown login challenge status: ${input.status}`);
    }
  } catch (error) {
    throw new RehydrationError(
      "Stored login challenge violates invariants",
      error,
    );
  }
}

/** Persisted form of a challenge, shared by the repository adapters. */
function snapshot(challenge: LoginChallenge): LoginChallengeSnapshot {
  return {
    id: challenge.id,
    email: challenge.email,
    linkTokenDigest: challenge.linkTokenDigest,
    codeDigest: challenge.codeDigest,
    expiresAt: challenge.expiresAt,
    status: challenge.status,
    failedCodeAttempts:
      challenge.status === "pending" ? challenge.failedCodeAttempts : null,
    version: challenge.version,
  };
}

export const LoginChallenge = {
  issue,
  redeemByLink,
  redeemByCode,
  isReplayOf,
  reconstruct,
  snapshot,
};
