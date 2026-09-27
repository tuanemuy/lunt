import type { CategoryCatalogRepository } from "./categoryCatalogRepository";
import type { ListingRepository } from "./listingRepository";
import type { OfferingPhaseLedger } from "./offeringPhaseLedger";

/**
 * Listing's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type ListingRepositories = Readonly<{
  listingRepository: ListingRepository;
  categoryCatalogRepository: CategoryCatalogRepository;
  offeringPhaseLedger: OfferingPhaseLedger;
}>;
