import type { OccasionRepositories } from "@repo/core/domain/occasion/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Occasion's aggregate repositories of one unit of work. */
export function createOccasionRepositories(
  _deps: RepositoryDeps,
): OccasionRepositories {
  return {};
}
