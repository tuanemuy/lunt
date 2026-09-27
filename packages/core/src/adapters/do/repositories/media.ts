import type { MediaRepositories } from "@repo/core/domain/media/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";
import { DoPhotoAssetRepository } from "./photoAssetRepository";

/** Media's aggregate repositories of one unit of work. */
export function createMediaRepositories(
  deps: RepositoryDeps,
): MediaRepositories {
  return {
    photoAssetRepository: new DoPhotoAssetRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
  };
}
