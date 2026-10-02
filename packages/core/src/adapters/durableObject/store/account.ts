import type {
  AccountCommand,
  AccountQueries,
  AccountRecord,
  LoginChallengeRecord,
} from "../protocol/account";
import type { SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import {
  APPLIED,
  deleteVersioned,
  insertUnique,
  updateVersioned,
} from "./versioned";

const ACCOUNT_TABLE_MIGRATION: Migration = {
  version: 2,
  name: "accounts",
  statements: [
    // `email` is UNIQUE: the port guarantees one account per address.
    // A withdrawn account is deleted, which frees its address.
    `CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL
    )`,
  ],
};

const LOGIN_CHALLENGE_TABLE_MIGRATION: Migration = {
  version: 4,
  name: "login challenges",
  statements: [
    // `link_token_digest` is UNIQUE: the port resolves a link by its digest
    // alone. A code is only ever checked against one challenge, so code
    // digests may repeat.
    `CREATE TABLE login_challenges (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      link_token_digest TEXT NOT NULL UNIQUE,
      code_digest TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      failed_code_attempts INTEGER,
      version INTEGER NOT NULL
    )`,
    `CREATE INDEX idx_login_challenges_expires_at
       ON login_challenges (expires_at)`,
    `CREATE INDEX idx_login_challenges_closed
       ON login_challenges (status) WHERE status <> 'pending'`,
  ],
};

/**
 * Account's tables. Migration versions are allocated globally
 * (`store/schema.ts`): take the next free number across all domains.
 */
export const ACCOUNT_MIGRATIONS: readonly Migration[] = [
  ACCOUNT_TABLE_MIGRATION,
  LOGIN_CHALLENGE_TABLE_MIGRATION,
];

type AccountRow = Readonly<{ id: string; email: string; version: number }> &
  SqlRow;

const COLUMNS = "id, email, version";

const toRecord = (row: AccountRow): AccountRecord => ({
  id: row.id,
  email: row.email,
  version: Number(row.version),
});

type LoginChallengeRow = Readonly<{
  id: string;
  email: string;
  link_token_digest: string;
  code_digest: string;
  expires_at: number;
  status: string;
  failed_code_attempts: number | null;
  version: number;
}> &
  SqlRow;

const CHALLENGE_COLUMNS = `id, email, link_token_digest, code_digest,
  expires_at, status, failed_code_attempts, version`;

// The stored status is passed through unchecked: the request side's
// `LoginChallenge.reconstruct` rejects an unknown one as a data-integrity
// failure.
const toChallengeRecord = (row: LoginChallengeRow): LoginChallengeRecord => ({
  id: row.id,
  email: row.email,
  linkTokenDigest: row.link_token_digest,
  codeDigest: row.code_digest,
  expiresAt: Number(row.expires_at),
  status: row.status as LoginChallengeRecord["status"],
  failedCodeAttempts:
    row.failed_code_attempts === null ? null : Number(row.failed_code_attempts),
  version: Number(row.version),
});

const challengeValues = (record: LoginChallengeRecord) => ({
  email: record.email,
  link_token_digest: record.linkTokenDigest,
  code_digest: record.codeDigest,
  expires_at: record.expiresAt,
  status: record.status,
  failed_code_attempts: record.failedCodeAttempts,
  version: record.version,
});

export const accountQueryHandlers: QueryHandlersOf<AccountQueries> = {
  "account.findById": (sql, { id }) => {
    const row = sql
      .exec<AccountRow>(`SELECT ${COLUMNS} FROM accounts WHERE id = ?`, id)
      .toArray()[0];
    return row ? toRecord(row) : null;
  },
  "account.findByEmail": (sql, { email }) => {
    const row = sql
      .exec<AccountRow>(
        `SELECT ${COLUMNS} FROM accounts WHERE email = ?`,
        email,
      )
      .toArray()[0];
    return row ? toRecord(row) : null;
  },
  "account.findByIds": (sql, { ids }) => {
    if (ids.length === 0) return [];
    return sql
      .exec<AccountRow>(
        `SELECT ${COLUMNS} FROM accounts
           WHERE id IN (SELECT value FROM json_each(?))
           ORDER BY id`,
        JSON.stringify(ids),
      )
      .toArray()
      .map(toRecord);
  },
  "account.loginChallenge.findById": (sql, { id }) => {
    const row = sql
      .exec<LoginChallengeRow>(
        `SELECT ${CHALLENGE_COLUMNS} FROM login_challenges WHERE id = ?`,
        id,
      )
      .toArray()[0];
    return row ? toChallengeRecord(row) : null;
  },
  "account.loginChallenge.findByLinkTokenDigest": (sql, { digest }) => {
    const row = sql
      .exec<LoginChallengeRow>(
        `SELECT ${CHALLENGE_COLUMNS} FROM login_challenges
           WHERE link_token_digest = ?`,
        digest,
      )
      .toArray()[0];
    return row ? toChallengeRecord(row) : null;
  },
  // Served by the `expires_at` index: only unexpired rows are scanned, and
  // the daily purge keeps those to a few minutes' worth of logins.
  "account.loginChallenge.countUnexpired": (sql, { email, now }) =>
    Number(
      sql
        .exec<{ n: number } & SqlRow>(
          `SELECT COUNT(*) AS n FROM login_challenges
             WHERE expires_at > ? AND email = ?`,
          now,
          email,
        )
        .toArray()[0]?.n ?? 0,
    ),
  // The same condition as `deleteClosedBefore`'s, once a day.
  "account.loginChallenge.countClosedBefore": (sql, { threshold }) =>
    Number(
      sql
        .exec<{ n: number } & SqlRow>(
          `SELECT COUNT(*) AS n FROM login_challenges
             WHERE status <> 'pending' OR expires_at < ?`,
          threshold,
        )
        .toArray()[0]?.n ?? 0,
    ),
};

export const accountCommandHandlers: CommandHandlersOf<AccountCommand> = {
  "account.insert": (sql, { record }) =>
    insertUnique(
      sql,
      "accounts",
      { id: record.id, email: record.email, version: record.version },
      `Account ${record.id} or an account with its email`,
    ),
  "account.save": (sql, { record, expectedVersion }) =>
    updateVersioned(
      sql,
      "accounts",
      { id: record.id },
      { email: record.email, version: record.version },
      expectedVersion,
      `Account ${record.id}`,
    ),
  "account.delete": (sql, { id, expectedVersion }) =>
    deleteVersioned(sql, "accounts", { id }, expectedVersion, `Account ${id}`),
  "account.loginChallenge.insert": (sql, { record }) =>
    insertUnique(
      sql,
      "login_challenges",
      { id: record.id, ...challengeValues(record) },
      `Login challenge ${record.id} or one with its link token`,
    ),
  "account.loginChallenge.save": (sql, { record, expectedVersion }) =>
    updateVersioned(
      sql,
      "login_challenges",
      { id: record.id },
      challengeValues(record),
      expectedVersion,
      `Login challenge ${record.id}`,
    ),
  "account.loginChallenge.deleteClosedBefore": (sql, { threshold }) => {
    sql.exec(
      `DELETE FROM login_challenges
         WHERE status <> 'pending' OR expires_at < ?`,
      threshold,
    );
    return APPLIED;
  },
};
