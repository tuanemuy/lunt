import type { ListingId } from "@repo/core/domain/common/ids";
import { Listing } from "@repo/core/domain/listing/listing";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireListing } from "./managedListing";

export type DeleteListingInput = Readonly<{ listingId: ListingId }>;

/**
 * Deletes a listing in any state (`spec/usecases/listing.md`
 * 「deleteListing」; LST-10, LST-16). Not restorable: it leaves every read
 * and its id cannot be created again. Its offering phase record goes in
 * the same unit of work. Emits `listing.deleted` and `photos.released` for
 * every photo.
 *
 * - `NotFoundError` when already deleted; `ForbiddenError`
 *   (`manage_target` on the place); `ConflictError` on a concurrent save
 *   or delete.
 */
export async function deleteListing({
  container,
  actor,
  input,
}: ActorServiceArgs<DeleteListingInput>): Promise<void> {
  const now = container.clock.now();
  await container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireListing(ctx, input.listingId);
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "place",
      id: found.entity.placeId,
    });
    const eventDrafts = Listing.delete(found.entity, now);
    await ctx.listingRepository.delete(found.entity.id, found.expectedVersion);
    await ctx.offeringPhaseLedger.remove(found.entity.id);
    ctx.collectEvents(eventDrafts);
  });
}
