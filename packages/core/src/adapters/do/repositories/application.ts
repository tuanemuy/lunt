import type { ApplicationRepositories } from "@repo/core/domain/application/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Application's aggregate repositories of one unit of work. */
export function createApplicationRepositories(
  _deps: RepositoryDeps,
): ApplicationRepositories {
  return {};
}
