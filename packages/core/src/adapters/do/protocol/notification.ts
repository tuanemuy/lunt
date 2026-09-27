import type { QuerySpec } from "./queries";

/**
 * Notification's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/notification.ts` must cover every one.
 */
export type NotificationQueries = Record<never, QuerySpec<unknown, unknown>>;

export type NotificationCommand = never;
