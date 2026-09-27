import type { ListingId } from "@repo/core/domain/common/ids";
import { Listing } from "@repo/core/domain/listing/listing";
import type { ActorServiceArgs } from "../types";
import type { ManagedListingView } from "./managedListing";
import { transitionListing } from "./transition";

export type EndListingOfferingInput = Readonly<{ listingId: ListingId }>;

/**
 * Ends a published listing's offering by hand, whatever its schedule and
 * while suspended too (`spec/usecases/listing.md` 「endListingOffering」;
 * LST-08, LST-16). Records the manual end only; `detectEndedOfferings`
 * emits the ended event.
 *
 * - `NotFoundError`; `ForbiddenError` (`manage_target` on the place).
 * - `BusinessRuleError`: `LISTING_NOT_PUBLISHED`, `LISTING_ALREADY_ENDED`.
 * - `ConflictError` on a concurrent save.
 */
export function endListingOffering({
  container,
  actor,
  input,
}: ActorServiceArgs<EndListingOfferingInput>): Promise<ManagedListingView> {
  return transitionListing(
    container,
    actor,
    input.listingId,
    "manager",
    Listing.endOffering,
  );
}
