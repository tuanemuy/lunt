import type { QuerySpec } from "./queries";

/**
 * Bookmark's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/bookmark.ts` must cover every one.
 */
export type BookmarkQueries = Record<never, QuerySpec<unknown, unknown>>;

/** Bookmark's write commands (none until its tables land). */
export type BookmarkCommand = never;
