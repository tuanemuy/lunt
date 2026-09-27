import type { QuerySpec } from "./queries";

/** At-rest shape of an account as the state object stores and returns it. */
export type AccountRecord = Readonly<{
  id: string;
  email: string;
  version: number;
}>;

/** At-rest shape of a login challenge. Times are epoch milliseconds. */
export type LoginChallengeRecord = Readonly<{
  id: string;
  email: string;
  linkTokenDigest: string;
  codeDigest: string;
  expiresAt: number;
  status: "pending" | "redeemed" | "exhausted";
  /** `null` unless `pending`. */
  failedCodeAttempts: number | null;
  version: number;
}>;

export type AccountQueries = {
  "account.findById": QuerySpec<{ id: string }, AccountRecord | null>;
  "account.findByEmail": QuerySpec<{ email: string }, AccountRecord | null>;
  /** Existing accounts among `ids`, in id order. */
  "account.findByIds": QuerySpec<
    { ids: readonly string[] },
    readonly AccountRecord[]
  >;
  "account.loginChallenge.findById": QuerySpec<
    { id: string },
    LoginChallengeRecord | null
  >;
  "account.loginChallenge.findByLinkTokenDigest": QuerySpec<
    { digest: string },
    LoginChallengeRecord | null
  >;
};

export type AccountCommand =
  | Readonly<{ kind: "account.insert"; record: AccountRecord }>
  | Readonly<{
      kind: "account.save";
      record: AccountRecord;
      expectedVersion: number;
    }>
  | Readonly<{ kind: "account.delete"; id: string; expectedVersion: number }>
  | Readonly<{
      kind: "account.loginChallenge.insert";
      record: LoginChallengeRecord;
    }>
  | Readonly<{
      kind: "account.loginChallenge.save";
      record: LoginChallengeRecord;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "account.loginChallenge.deleteClosedBefore";
      /** Epoch milliseconds. */
      threshold: number;
    }>;
