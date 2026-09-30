import type { QuerySpec } from "./queries";

/**
 * Article's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/article.ts` must cover every one.
 */
export type ArticleQueries = Record<never, QuerySpec<unknown, unknown>>;

/** Article's write commands (none until its tables land). */
export type ArticleCommand = never;
