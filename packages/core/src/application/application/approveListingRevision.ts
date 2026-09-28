import { Listing } from "@repo/core/domain/listing/listing";
import { requireListing } from "../listing/managedListing";
import type { ActorServiceArgs } from "../types";
import {
  type ApprovalOutcome,
  type ApproveApplicationInput,
  approveApplication,
} from "./approval";

export type ApproveListingRevisionInput = ApproveApplicationInput;

/**
 * An operator approves a revision of a listing of a place without a
 * steward (LST-14, CM-01): only the application's items are laid onto
 * the listing as it is now (`Listing.applyPatch`, whatever its
 * publication state or suspension), a retired category resolves to an
 * active one, photos removed from the listing since submission stay out,
 * the application's added photos become the listing's and photos the
 * revision drops are released (`photos.released`). When the listing is
 * gone, or its place has gained a steward, the application lapses instead
 * (returned, not thrown).
 *
 * - `NotFoundError` (none, or not a listing revision); `ForbiddenError`.
 * - The status code when not under review;
 *   `LISTING_PATCH_PHOTOS_UNAVAILABLE` when none of the revision's photos
 *   would remain (the application stays under review); `ConflictError`
 *   when the application changed since `version`, or the listing changed
 *   before the commit.
 */
export async function approveListingRevision({
  container,
  actor,
  input,
}: ActorServiceArgs<ApproveListingRevisionInput>): Promise<ApprovalOutcome> {
  return approveApplication({
    container,
    actor,
    input,
    kind: "listingRevision",
    load: async (ctx, app) => {
      const [listing, catalog] = await Promise.all([
        requireListing(ctx, app.target.listingId),
        ctx.categoryCatalogRepository.find(),
      ]);
      return { listing, catalog };
    },
    reflect: async (ctx, app, { listing, catalog }, now) => {
      const { entity, eventDrafts } = Listing.applyPatch(
        listing.entity,
        app.content,
        catalog.entity,
        now,
      );
      if (entity !== listing.entity) {
        await ctx.listingRepository.save(entity, listing.expectedVersion);
      }
      return { eventDrafts };
    },
  });
}
