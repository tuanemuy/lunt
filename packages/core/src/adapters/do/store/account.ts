import type {
  AccountCommand,
  AccountQueries,
  AccountRecord,
} from "../protocol/account";
import type { SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import { deleteVersioned, insertUnique, updateVersioned } from "./versioned";

export const ACCOUNT_MIGRATION: Migration = {
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

type AccountRow = Readonly<{ id: string; email: string; version: number }> &
  SqlRow;

const COLUMNS = "id, email, version";

const toRecord = (row: AccountRow): AccountRecord => ({
  id: row.id,
  email: row.email,
  version: Number(row.version),
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
};
