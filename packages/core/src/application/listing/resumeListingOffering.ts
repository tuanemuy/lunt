import type { ListingId } from "@repo/core/domain/common/ids";
import { Listing } from "@repo/core/domain/listing/listing";
import type { ActorServiceArgs } from "../types";
import type { ManagedListingView } from "./managedListing";
import { transitionListing } from "./transition";

export type ResumeListingOfferingInput = Readonly<{ listingId: ListingId }>;

/**
 * Lifts a manual end, published or unpublished and while suspended
 * (`spec/usecases/listing.md` 「resumeListingOffering」; LST-08, LST-16).
 * The status then follows the schedule: past its end it stays ended
 * (`cause: "schedule"`). No domain event.
 *
 * - `NotFoundError`; `ForbiddenError` (`manage_target` on the place).
 * - `BusinessRuleError`: `LISTING_NOT_MANUALLY_ENDED` (a schedule end or a
 *   draft included).
 * - `ConflictError` on a concurrent save.
 */
export function resumeListingOffering({
  container,
  actor,
  input,
}: ActorServiceArgs<ResumeListingOfferingInput>): Promise<ManagedListingView> {
  return transitionListing(
    container,
    actor,
    input.listingId,
    "manager",
    Listing.resumeOffering,
  );
}
