import type { AuthorityRepositories } from "@repo/core/domain/authority/ports/unitOfWork";
import { DoAccessGuard } from "./accessGuard";
import type { RepositoryDeps } from "./deps";
import { DoRoleRosterRepository } from "./roleRosterRepository";
import { DoStewardshipRepository } from "./stewardshipRepository";

/** Authority's aggregate repositories of one unit of work. */
export function createAuthorityRepositories(
  deps: RepositoryDeps,
): AuthorityRepositories {
  return {
    stewardshipRepository: new DoStewardshipRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
    roleRosterRepository: new DoRoleRosterRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
    accessGuard: new DoAccessGuard(deps.conditions),
  };
}
