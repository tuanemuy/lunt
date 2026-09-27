import type { ListingId } from "@repo/core/domain/common/ids";
import { Listing } from "@repo/core/domain/listing/listing";
import type { ActorServiceArgs } from "../types";
import type { ManagedListingView } from "./managedListing";
import { transitionListing } from "./transition";

export type PublishListingInput = Readonly<{ listingId: ListingId }>;

/**
 * Publishes a draft or re-publishes an unpublished listing
 * (`spec/usecases/listing.md` 「publishListing」; LST-04, LST-07, LST-15,
 * LST-16, MOD-03). No approval; a suspended place does not matter. A
 * re-publication keeps the manual end. No domain event.
 *
 * - `NotFoundError`; `ForbiddenError` (`manage_target` on the place).
 * - `BusinessRuleError`, in this order: `LISTING_SUSPENDED`,
 *   `COMMON_PUBLICATION_INVALID_TRANSITION` (already published),
 *   `LISTING_PUBLISH_CONDITION_UNMET` (with what is missing).
 * - `ConflictError` on a concurrent save.
 */
export function publishListing({
  container,
  actor,
  input,
}: ActorServiceArgs<PublishListingInput>): Promise<ManagedListingView> {
  return transitionListing(
    container,
    actor,
    input.listingId,
    "manager",
    Listing.publish,
  );
}
