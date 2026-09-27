import type { RoleRosterRepository } from "./roleRosterRepository";
import type { StewardshipRepository } from "./stewardshipRepository";

/**
 * Authority's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type AuthorityRepositories = Readonly<{
  stewardshipRepository: StewardshipRepository;
  roleRosterRepository: RoleRosterRepository;
}>;
