import { Listing } from "@repo/core/domain/listing/listing";
import type { ActorServiceArgs } from "../types";
import {
  type ApprovalOutcome,
  type ApproveApplicationInput,
  approveApplication,
} from "./approval";

export type ApproveNewListingInput = ApproveApplicationInput;

/**
 * An operator approves a listing application for a place without a
 * steward (LST-14, CM-01): a published listing is created under the
 * reserved id with the application's content (`Listing.createPublished`,
 * no event), its category resolved to an active one, and the
 * application's photos become the listing's. The applicant gains no
 * management; the listing is the operators' while the place has no
 * steward. A suspended place's listing is created all the same and stays
 * hidden until the place is unsuspended. When the place has gained a
 * steward since, the application lapses instead (returned, not thrown).
 *
 * - `NotFoundError` (none, or not a listing application);
 *   `ForbiddenError`.
 * - The status code when not under review; `ConflictError` when changed
 *   since `version`.
 */
export async function approveNewListing({
  container,
  actor,
  input,
}: ActorServiceArgs<ApproveNewListingInput>): Promise<ApprovalOutcome> {
  return approveApplication({
    container,
    actor,
    input,
    kind: "listing",
    load: (ctx) => ctx.categoryCatalogRepository.find(),
    reflect: async (ctx, app, catalog, now) => {
      const { entity, eventDrafts } = Listing.createPublished(
        {
          id: app.reservedListingId,
          placeId: app.target.placeId,
          content: app.content,
        },
        catalog.entity,
        now,
      );
      await ctx.listingRepository.insert(entity);
      return { eventDrafts };
    },
  });
}
