import type { AuthorityRepositories } from "@repo/core/domain/authority/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Authority's aggregate repositories of one unit of work. */
export function createAuthorityRepositories(
  _deps: RepositoryDeps,
): AuthorityRepositories {
  return {};
}
