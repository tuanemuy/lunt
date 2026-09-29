import type { QuerySpec } from "./queries";

/**
 * Region's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/region.ts` must cover every one.
 */
export type RegionQueries = Record<never, QuerySpec<unknown, unknown>>;

/** Region's write commands (none until its tables land). */
export type RegionCommand = never;
