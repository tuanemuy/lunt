import type { QuerySpec } from "./queries";

/**
 * Listing's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/listing.ts` must cover every one.
 */
export type ListingQueries = Record<never, QuerySpec<unknown, unknown>>;

export type ListingCommand = never;
