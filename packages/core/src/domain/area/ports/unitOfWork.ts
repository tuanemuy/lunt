/**
 * Area's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type AreaRepositories = Readonly<Record<never, never>>;
