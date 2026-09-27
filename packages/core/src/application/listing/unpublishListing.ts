import type { ListingId } from "@repo/core/domain/common/ids";
import { Listing } from "@repo/core/domain/listing/listing";
import type { ActorServiceArgs } from "../types";
import type { ManagedListingView } from "./managedListing";
import { transitionListing } from "./transition";

export type UnpublishListingInput = Readonly<{ listingId: ListingId }>;

/**
 * Unpublishes a published listing by hand (`spec/usecases/listing.md`
 * 「unpublishListing」; LST-07, LST-16): `unpublished` / `byManager`, content,
 * manual end and first publication unchanged. Emits `listing.unpublished`.
 *
 * - `NotFoundError`; `ForbiddenError` (`manage_target` on the place).
 * - `BusinessRuleError`: `LISTING_SUSPENDED`,
 *   `COMMON_PUBLICATION_INVALID_TRANSITION` (not published).
 * - `ConflictError` on a concurrent save.
 */
export function unpublishListing({
  container,
  actor,
  input,
}: ActorServiceArgs<UnpublishListingInput>): Promise<ManagedListingView> {
  return transitionListing(
    container,
    actor,
    input.listingId,
    "manager",
    Listing.unpublish,
  );
}
