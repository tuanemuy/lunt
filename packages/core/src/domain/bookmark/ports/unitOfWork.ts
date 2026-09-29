/**
 * Bookmark's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type BookmarkRepositories = Readonly<Record<never, never>>;
