import type { ListingRepositories } from "@repo/core/domain/listing/ports/unitOfWork";
import { DoCategoryCatalogRepository } from "./categoryCatalogRepository";
import type { RepositoryDeps } from "./deps";
import { DoListingRepository } from "./listingRepository";
import { DoOfferingPhaseLedger } from "./offeringPhaseLedger";

/** Listing's aggregate repositories of one unit of work. */
export function createListingRepositories(
  deps: RepositoryDeps,
): ListingRepositories {
  return {
    listingRepository: new DoListingRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
    categoryCatalogRepository: new DoCategoryCatalogRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
    offeringPhaseLedger: new DoOfferingPhaseLedger(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
  };
}
