import type {
  DevMailInput,
  DevMailQuery,
  DevMailRecord,
} from "../protocol/devMailbox";
import type { SqlExec, SqlRow } from "../sql";
import type { Migration } from "./schema";

/**
 * The development inbox (design.md D-07): mails the development transport
 * accepted, readable on `/__dev/inbox`. Written and read outside the unit
 * of work, like the dead letters — sending mail is a side effect that
 * never joins a commit.
 */
export const DEV_MAILBOX_MIGRATIONS: readonly Migration[] = [
  {
    version: 8,
    name: "development mailbox",
    statements: [
      `CREATE TABLE dev_mailbox (
        id TEXT PRIMARY KEY,
        sender TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        text_body TEXT NOT NULL,
        html_body TEXT,
        sent_at INTEGER NOT NULL
      )`,
      `CREATE INDEX idx_dev_mailbox_recipient
         ON dev_mailbox (recipient, sent_at)`,
      "CREATE INDEX idx_dev_mailbox_sent_at ON dev_mailbox (sent_at)",
    ],
  },
];

type DevMailRow = Readonly<{
  id: string;
  sender: string;
  recipient: string;
  subject: string;
  text_body: string;
  html_body: string | null;
  sent_at: number;
}> &
  SqlRow;

const toRecord = (row: DevMailRow): DevMailRecord => ({
  id: row.id,
  from: row.sender,
  to: row.recipient,
  subject: row.subject,
  text: row.text_body,
  html: row.html_body,
  sentAt: new Date(Number(row.sent_at)),
});

export function appendDevMail(sql: SqlExec, mail: DevMailInput): void {
  sql.exec(
    `INSERT INTO dev_mailbox
       (id, sender, recipient, subject, text_body, html_body, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    mail.id,
    mail.from,
    mail.to,
    mail.subject,
    mail.text,
    mail.html,
    mail.sentAt.getTime(),
  );
}

/** Newest first; mails sent in the same millisecond by id ascending. */
export function listDevMail(
  sql: SqlExec,
  query: DevMailQuery,
): readonly DevMailRecord[] {
  const columns =
    "id, sender, recipient, subject, text_body, html_body, sent_at";
  const rows =
    query.to === undefined
      ? sql.exec<DevMailRow>(
          `SELECT ${columns} FROM dev_mailbox
             ORDER BY sent_at DESC, id LIMIT ?`,
          query.limit,
        )
      : sql.exec<DevMailRow>(
          `SELECT ${columns} FROM dev_mailbox WHERE recipient = ?
             ORDER BY sent_at DESC, id LIMIT ?`,
          query.to,
          query.limit,
        );
  return rows.toArray().map(toRecord);
}
