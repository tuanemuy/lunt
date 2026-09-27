import type { PhotoAssetRepository } from "./photoAssetRepository";

/**
 * Media's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type MediaRepositories = Readonly<{
  photoAssetRepository: PhotoAssetRepository;
}>;
