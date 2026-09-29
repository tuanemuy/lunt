/**
 * Region's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type RegionRepositories = Readonly<Record<never, never>>;
