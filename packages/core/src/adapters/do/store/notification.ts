import type {
  MailKeyRecord,
  NotificationCommand,
  NotificationQueries,
  NotificationRecord,
} from "../protocol/notification";
import type { SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import { APPLIED } from "./versioned";

const NOTIFICATION_TABLES_MIGRATION: Migration = {
  version: 7,
  name: "notifications and mail dispatches",
  statements: [
    // (recipient, occurrence_key) is UNIQUE: the port keeps one notification
    // per occurrence and recipient, and a redelivery's insert is a no-op.
    // `occurrence` is the occurrence's JSON; `created_at` is epoch ms.
    `CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      occurrence_key TEXT NOT NULL,
      occurrence TEXT NOT NULL,
      delivery TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (recipient, occurrence_key)
    )`,
    `CREATE INDEX idx_notifications_recipient_created
       ON notifications (recipient, created_at DESC, id)`,
    // One row per sent mail key; never listed or deleted.
    `CREATE TABLE mail_dispatches (
      occurrence_key TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      PRIMARY KEY (occurrence_key, recipient_email)
    )`,
  ],
};

/**
 * Notification's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Notification starts at 7; take the next free number
 * across all domains for any later migration.
 */
export const NOTIFICATION_MIGRATIONS: readonly Migration[] = [
  NOTIFICATION_TABLES_MIGRATION,
];

type NotificationRow = Readonly<{
  id: string;
  recipient: string;
  occurrence_key: string;
  occurrence: string;
  delivery: string;
  created_at: number;
}> &
  SqlRow;

type MailKeyRow = Readonly<{
  occurrence_key: string;
  recipient_email: string;
}> &
  SqlRow;

const COLUMNS =
  "id, recipient, occurrence_key, occurrence, delivery, created_at";

const toRecord = (row: NotificationRow): NotificationRecord => ({
  id: row.id,
  recipient: row.recipient,
  occurrenceKey: row.occurrence_key,
  occurrence: row.occurrence,
  delivery: row.delivery,
  createdAt: Number(row.created_at),
});

const toKey = (row: MailKeyRow): MailKeyRecord => ({
  occurrenceKey: row.occurrence_key,
  to: row.recipient_email,
});

export const notificationQueryHandlers: QueryHandlersOf<NotificationQueries> = {
  "notification.findByRecipient": (sql, { recipient, page, limit }) => {
    const items = sql
      .exec<NotificationRow>(
        `SELECT ${COLUMNS} FROM notifications
             WHERE recipient = ?
             ORDER BY created_at DESC, id
             LIMIT ? OFFSET ?`,
        recipient,
        limit,
        (page - 1) * limit,
      )
      .toArray()
      .map(toRecord);
    const count = sql
      .exec<{ n: number } & SqlRow>(
        "SELECT COUNT(*) AS n FROM notifications WHERE recipient = ?",
        recipient,
      )
      .toArray()[0];
    return { items, count: Number(count?.n ?? 0) };
  },
  "notification.findDispatchedMails": (sql, { keys }) => {
    if (keys.length === 0) return [];
    return sql
      .exec<MailKeyRow>(
        `SELECT DISTINCT d.occurrence_key, d.recipient_email
             FROM json_each(?) j
             JOIN mail_dispatches d
               ON d.occurrence_key = json_extract(j.value, '$.occurrenceKey')
              AND d.recipient_email = json_extract(j.value, '$.to')`,
        JSON.stringify(
          keys.map(({ occurrenceKey, to }) => ({ occurrenceKey, to })),
        ),
      )
      .toArray()
      .map(toKey);
  },
};

// Every write is insert-if-absent or delete: nothing here can conflict, so
// every command reports `applied`.
export const notificationCommandHandlers: CommandHandlersOf<NotificationCommand> =
  {
    "notification.deliverAll": (sql, { records }) => {
      // Only the (recipient, occurrence_key) key is idempotent; a reused
      // notification id is a bug and must fail the commit, not vanish.
      for (const record of records) {
        sql.exec(
          `INSERT INTO notifications (${COLUMNS})
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (recipient, occurrence_key) DO NOTHING`,
          record.id,
          record.recipient,
          record.occurrenceKey,
          record.occurrence,
          record.delivery,
          record.createdAt,
        );
      }
      return APPLIED;
    },
    "notification.removeAllByRecipient": (sql, { recipient }) => {
      sql.exec("DELETE FROM notifications WHERE recipient = ?", recipient);
      return APPLIED;
    },
    "notification.recordMailDispatch": (sql, { key }) => {
      sql.exec(
        `INSERT INTO mail_dispatches (occurrence_key, recipient_email)
           VALUES (?, ?)
           ON CONFLICT (occurrence_key, recipient_email) DO NOTHING`,
        key.occurrenceKey,
        key.to,
      );
      return APPLIED;
    },
  };
