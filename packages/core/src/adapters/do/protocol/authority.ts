import type { QuerySpec } from "./queries";

/**
 * Authority's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/authority.ts` must cover every one.
 */
export type AuthorityQueries = Record<never, QuerySpec<unknown, unknown>>;

export type AuthorityCommand = never;
