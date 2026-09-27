import type { QuerySpec } from "./queries";

/**
 * Media's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/media.ts` must cover every one.
 */
export type MediaQueries = Record<never, QuerySpec<unknown, unknown>>;

export type MediaCommand = never;
