import type { PlaceRepositories } from "@repo/core/domain/place/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Place's aggregate repositories of one unit of work. */
export function createPlaceRepositories(
  _deps: RepositoryDeps,
): PlaceRepositories {
  return {};
}
