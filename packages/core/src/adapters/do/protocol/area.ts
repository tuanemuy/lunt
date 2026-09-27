import type { QuerySpec } from "./queries";

/**
 * Area's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/area.ts` must cover every one.
 */
export type AreaQueries = Record<never, QuerySpec<unknown, unknown>>;

export type AreaCommand = never;
