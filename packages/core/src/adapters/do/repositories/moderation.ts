import type { ModerationRepositories } from "@repo/core/domain/moderation/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Moderation's aggregate repositories of one unit of work. */
export function createModerationRepositories(
  _deps: RepositoryDeps,
): ModerationRepositories {
  return {};
}
