import type { PlaceRepository } from "./placeRepository";

/**
 * Place's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type PlaceRepositories = Readonly<{
  placeRepository: PlaceRepository;
}>;
