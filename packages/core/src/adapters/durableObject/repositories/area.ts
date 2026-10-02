import type { AreaRepositories } from "@repo/core/domain/area/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Area's aggregate repositories of one unit of work. */
export function createAreaRepositories(
  _deps: RepositoryDeps,
): AreaRepositories {
  return {};
}
