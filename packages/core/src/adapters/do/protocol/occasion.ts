import type { QuerySpec } from "./queries";

/**
 * Occasion's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/occasion.ts` must cover every one.
 */
export type OccasionQueries = Record<never, QuerySpec<unknown, unknown>>;

/** Occasion's write commands (none until its tables land). */
export type OccasionCommand = never;
