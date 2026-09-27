/**
 * Authority's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type AuthorityRepositories = Readonly<Record<never, never>>;
