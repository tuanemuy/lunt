import type { InfoReportRepository } from "./infoReportRepository";
import type { TakedownClaimRepository } from "./takedownClaimRepository";

/**
 * Moderation's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type ModerationRepositories = Readonly<{
  takedownClaimRepository: TakedownClaimRepository;
  infoReportRepository: InfoReportRepository;
}>;
