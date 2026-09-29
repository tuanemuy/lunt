import type { OccasionRepositories } from "@repo/core/domain/occasion/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";
import { DoHoldingStatusLedger } from "./holdingStatusLedger";
import { DoOccasionRepository } from "./occasionRepository";
import { DoParticipationRepository } from "./participationRepository";
import { DoRegionLinkRepository } from "./regionLinkRepository";

/** Occasion's aggregate repositories of one unit of work. */
export function createOccasionRepositories(
  deps: RepositoryDeps,
): OccasionRepositories {
  return {
    occasionRepository: new DoOccasionRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
    participationRepository: new DoParticipationRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
    regionLinkRepository: new DoRegionLinkRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
    holdingStatusLedger: new DoHoldingStatusLedger(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
  };
}
