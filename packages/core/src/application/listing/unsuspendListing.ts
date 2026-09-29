import type { ListingId } from "@repo/core/domain/common/ids";
import { Listing } from "@repo/core/domain/listing/listing";
import type { ActorServiceArgs } from "../types";
import type { ManagedListingView } from "./managedListing";
import { transitionListing } from "./transition";

export type UnsuspendListingInput = Readonly<{ listingId: ListingId }>;

/**
 * An operator lifts a listing's suspension (`spec/usecases/listing.md`
 * 「unsuspendListing」; MOD-07): the stored publication state shows again —
 * `unpublished` / `photoTakedown` when the last photo was taken down
 * meanwhile. Emits `listing.unsuspended`.
 *
 * - `NotFoundError`, checked before access; `ForbiddenError`
 *   (`operate_service`).
 * - `BusinessRuleError`: `LISTING_NOT_SUSPENDED`.
 * - `ConflictError` on a concurrent save.
 */
export function unsuspendListing({
  container,
  actor,
  input,
}: ActorServiceArgs<UnsuspendListingInput>): Promise<ManagedListingView> {
  return transitionListing(
    container,
    actor,
    input.listingId,
    "operator",
    Listing.unsuspend,
  );
}
