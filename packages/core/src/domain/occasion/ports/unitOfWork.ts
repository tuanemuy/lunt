import type { HoldingStatusLedger } from "./holdingStatusLedger";
import type { OccasionRepository } from "./occasionRepository";
import type { ParticipationRepository } from "./participationRepository";
import type { RegionLinkRepository } from "./regionLinkRepository";

/**
 * Occasion's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type OccasionRepositories = Readonly<{
  occasionRepository: OccasionRepository;
  participationRepository: ParticipationRepository;
  regionLinkRepository: RegionLinkRepository;
  holdingStatusLedger: HoldingStatusLedger;
}>;
