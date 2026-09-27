import type { QuerySpec } from "./queries";

/**
 * Place's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/place.ts` must cover every one.
 */
export type PlaceQueries = Record<never, QuerySpec<unknown, unknown>>;

export type PlaceCommand = never;
