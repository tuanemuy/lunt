import type { DiscoveryRepositories } from "@repo/core/domain/discovery/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Discovery's aggregate repositories of one unit of work. */
export function createDiscoveryRepositories(
  _deps: RepositoryDeps,
): DiscoveryRepositories {
  return {};
}
