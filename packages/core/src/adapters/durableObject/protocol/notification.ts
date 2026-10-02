import type { QuerySpec } from "./queries";

/**
 * At-rest shape of a notification. `occurrence` is the occurrence's JSON
 * text; `createdAt` is epoch milliseconds.
 */
export type NotificationRecord = Readonly<{
  id: string;
  recipient: string;
  occurrenceKey: string;
  occurrence: string;
  delivery: string;
  createdAt: number;
}>;

/** A `MailKey` on the wire. */
export type MailKeyRecord = Readonly<{ occurrenceKey: string; to: string }>;

/**
 * Notification's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/notification.ts` must cover every one.
 */
export type NotificationQueries = {
  "notification.findByRecipient": QuerySpec<
    { recipient: string; page: number; limit: number },
    Readonly<{ items: readonly NotificationRecord[]; count: number }>
  >;
  /** The recorded keys among `keys` (at most 100). */
  "notification.findDispatchedMails": QuerySpec<
    { keys: readonly MailKeyRecord[] },
    readonly MailKeyRecord[]
  >;
};

export type NotificationCommand =
  | Readonly<{
      /** Insert-if-absent per (`recipient`, `occurrenceKey`). */
      kind: "notification.deliverAll";
      records: readonly NotificationRecord[];
    }>
  | Readonly<{ kind: "notification.removeAllByRecipient"; recipient: string }>
  | Readonly<{ kind: "notification.recordMailDispatch"; key: MailKeyRecord }>;
