import type { ListingServices } from "../listing/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Listing's wiring reads. */
export type ListingEnv = Readonly<Record<never, never>>;

export function createListingServices(
  _env: ListingEnv,
  _deps: ServiceDeps,
): ListingServices {
  return {};
}
