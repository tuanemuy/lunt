import type { RegionRepositories } from "@repo/core/domain/region/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";
import { DoPlaceAffiliationsRepository } from "./placeAffiliationsRepository";
import { DoRegionRepository } from "./regionRepository";

/** Region's aggregate repositories of one unit of work. */
export function createRegionRepositories(
  deps: RepositoryDeps,
): RegionRepositories {
  return {
    regionRepository: new DoRegionRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
    placeAffiliationsRepository: new DoPlaceAffiliationsRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
  };
}
