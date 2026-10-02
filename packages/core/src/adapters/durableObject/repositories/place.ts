import type { PlaceRepositories } from "@repo/core/domain/place/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";
import { DoPlaceRepository } from "./placeRepository";

/** Place's aggregate repositories of one unit of work. */
export function createPlaceRepositories(
  deps: RepositoryDeps,
): PlaceRepositories {
  return {
    placeRepository: new DoPlaceRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
  };
}
