import type { ListingId } from "@repo/core/domain/common/ids";
import { Listing } from "@repo/core/domain/listing/listing";
import type { ActorServiceArgs } from "../types";
import type { ManagedListingView } from "./managedListing";
import { transitionListing } from "./transition";

export type SuspendListingInput = Readonly<{ listingId: ListingId }>;

/**
 * An operator suspends a listing in any publication state, stewarded or
 * not (`spec/usecases/listing.md` 「suspendListing」; MOD-07, MOD-02). The
 * publication state is kept. Emits `listing.suspended`.
 *
 * - `NotFoundError`, checked before access; `ForbiddenError`
 *   (`operate_service`, also when revoked before the commit).
 * - `BusinessRuleError`: `LISTING_ALREADY_SUSPENDED`.
 * - `ConflictError` on a concurrent save.
 */
export function suspendListing({
  container,
  actor,
  input,
}: ActorServiceArgs<SuspendListingInput>): Promise<ManagedListingView> {
  return transitionListing(
    container,
    actor,
    input.listingId,
    "operator",
    Listing.suspend,
  );
}
