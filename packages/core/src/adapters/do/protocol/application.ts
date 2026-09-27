import type { QuerySpec } from "./queries";

/**
 * Application's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/application.ts` must cover every one.
 */
export type ApplicationQueries = Record<never, QuerySpec<unknown, unknown>>;

export type ApplicationCommand = never;
