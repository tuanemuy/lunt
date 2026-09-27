import type { MediaRepositories } from "@repo/core/domain/media/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Media's aggregate repositories of one unit of work. */
export function createMediaRepositories(
  _deps: RepositoryDeps,
): MediaRepositories {
  return {};
}
