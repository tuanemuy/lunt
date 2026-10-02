import type {
  BookmarkCommand,
  BookmarkQueries,
  BookmarkRecord,
  BookmarkTargetRecord,
} from "../protocol/bookmark";
import type { SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import { APPLIED } from "./versioned";

const BOOKMARK_TABLES_MIGRATION: Migration = {
  version: 19,
  name: "bookmarks",
  statements: [
    // The key is the bookmark's identity, so a repeated save's insert is a
    // no-op that keeps the first `saved_at` (epoch ms).
    `CREATE TABLE bookmarks (
      account_id TEXT NOT NULL,
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      saved_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, target_kind, target_id)
    )`,
    `CREATE INDEX idx_bookmarks_account_saved
       ON bookmarks (account_id, saved_at DESC, target_kind, target_id)`,
  ],
};

/** Bookmark's tables (migration 19). */
export const BOOKMARK_MIGRATIONS: readonly Migration[] = [
  BOOKMARK_TABLES_MIGRATION,
];

type BookmarkRow = Readonly<{
  account_id: string;
  target_kind: string;
  target_id: string;
  saved_at: number;
}> &
  SqlRow;

type TargetRow = Readonly<{ target_kind: string; target_id: string }> & SqlRow;

const toRecord = (row: BookmarkRow): BookmarkRecord => ({
  accountId: row.account_id,
  target: { kind: row.target_kind, id: row.target_id },
  savedAt: Number(row.saved_at),
});

const toTarget = (row: TargetRow): BookmarkTargetRecord => ({
  kind: row.target_kind,
  id: row.target_id,
});

export const bookmarkQueryHandlers: QueryHandlersOf<BookmarkQueries> = {
  "bookmark.findByAccount": (sql, { accountId, page, limit }) => {
    const items = sql
      .exec<BookmarkRow>(
        `SELECT account_id, target_kind, target_id, saved_at FROM bookmarks
           WHERE account_id = ?
           ORDER BY saved_at DESC, target_kind, target_id
           LIMIT ? OFFSET ?`,
        accountId,
        limit,
        (page - 1) * limit,
      )
      .toArray()
      .map(toRecord);
    const count = sql
      .exec<{ n: number } & SqlRow>(
        "SELECT COUNT(*) AS n FROM bookmarks WHERE account_id = ?",
        accountId,
      )
      .toArray()[0];
    return { items, count: Number(count?.n ?? 0) };
  },
  "bookmark.findSavedTargets": (sql, { accountId, targets }) => {
    if (targets.length === 0) return [];
    // CROSS JOIN keeps the input outermost, so each target is one primary
    // key lookup instead of a scan of the account's bookmarks.
    return sql
      .exec<TargetRow>(
        `SELECT DISTINCT b.target_kind, b.target_id
           FROM json_each(?) j
           CROSS JOIN bookmarks b
          WHERE b.account_id = ?
            AND b.target_kind = json_extract(j.value, '$.kind')
            AND b.target_id = json_extract(j.value, '$.id')`,
        JSON.stringify(targets.map(({ kind, id }) => ({ kind, id }))),
        accountId,
      )
      .toArray()
      .map(toTarget);
  },
};

// Every write is insert-if-absent or delete: nothing here can conflict, so
// every command reports `applied`.
export const bookmarkCommandHandlers: CommandHandlersOf<BookmarkCommand> = {
  "bookmark.addAll": (sql, { records }) => {
    for (const record of records) {
      sql.exec(
        `INSERT INTO bookmarks (account_id, target_kind, target_id, saved_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (account_id, target_kind, target_id) DO NOTHING`,
        record.accountId,
        record.target.kind,
        record.target.id,
        record.savedAt,
      );
    }
    return APPLIED;
  },
  "bookmark.remove": (sql, { accountId, target }) => {
    sql.exec(
      `DELETE FROM bookmarks
         WHERE account_id = ? AND target_kind = ? AND target_id = ?`,
      accountId,
      target.kind,
      target.id,
    );
    return APPLIED;
  },
  "bookmark.removeAllByAccount": (sql, { accountId }) => {
    sql.exec("DELETE FROM bookmarks WHERE account_id = ?", accountId);
    return APPLIED;
  },
};
