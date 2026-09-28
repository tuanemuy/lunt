import type { ModerationRepositories } from "@repo/core/domain/moderation/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";
import { DoInfoReportRepository } from "./infoReportRepository";
import { DoTakedownClaimRepository } from "./takedownClaimRepository";

/** Moderation's aggregate repositories of one unit of work. */
export function createModerationRepositories(
  deps: RepositoryDeps,
): ModerationRepositories {
  return {
    takedownClaimRepository: new DoTakedownClaimRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
    infoReportRepository: new DoInfoReportRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
  };
}
