import type { ListingId } from "@repo/core/domain/common/ids";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import {
  type ManagedListingView,
  presentManagedListing,
  readViewContext,
  requireListing,
} from "./managedListing";

export type GetManagedListingInput = Readonly<{ listingId: ListingId }>;

/**
 * One listing for the people who manage it, and for an operator opening
 * it by id (`spec/usecases/listing.md` 「getManagedListing」; LST-06 …
 * LST-16, MOD-03, MOD-07): content (category resolved), publication state
 * and reason, suspension, today's offering status, whether a takedown
 * removed photos, the place's name / address / regions / suspension,
 * whether the place has a steward and whether the actor may manage it.
 * Listings viewers cannot see are returned too.
 *
 * - `NotFoundError` when it does not exist; `ForbiddenError`
 *   (`inspect_target` on the place).
 */
export async function getManagedListing({
  container,
  actor,
  input,
}: ActorServiceArgs<GetManagedListingInput>): Promise<ManagedListingView> {
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireListing(ctx, input.listingId);
    const access = await authorizeOnTarget(ctx, actor, "inspect_target", {
      kind: "place",
      id: found.entity.placeId,
    });
    const view = await readViewContext(ctx, found.entity.placeId);
    return { ...view, access, listing: found.entity };
  });
  return presentManagedListing(container, read);
}
