import type { ListingRepositories } from "@repo/core/domain/listing/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Listing's aggregate repositories of one unit of work. */
export function createListingRepositories(
  _deps: RepositoryDeps,
): ListingRepositories {
  return {};
}
