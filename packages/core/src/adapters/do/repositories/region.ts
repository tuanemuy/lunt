import type { RegionRepositories } from "@repo/core/domain/region/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Region's aggregate repositories of one unit of work. */
export function createRegionRepositories(
  _deps: RepositoryDeps,
): RegionRepositories {
  return {};
}
