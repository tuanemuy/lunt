import type { PlaceAffiliationsRepository } from "./placeAffiliationsRepository";
import type { RegionRepository } from "./regionRepository";

/**
 * Region's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type RegionRepositories = Readonly<{
  regionRepository: RegionRepository;
  placeAffiliationsRepository: PlaceAffiliationsRepository;
}>;
