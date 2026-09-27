import type { QuerySpec } from "./queries";

/**
 * Discovery's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/discovery.ts` must cover every one.
 */
export type DiscoveryQueries = Record<never, QuerySpec<unknown, unknown>>;

export type DiscoveryCommand = never;
