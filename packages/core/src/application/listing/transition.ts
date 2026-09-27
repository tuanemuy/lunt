import type { Actor } from "@repo/core/domain/common/actor";
import type { WithEventDrafts } from "@repo/core/domain/common/event";
import type { ListingId } from "@repo/core/domain/common/ids";
import type { Listing } from "@repo/core/domain/listing/listing";
import {
  authorizeOnTarget,
  authorizeRole,
  readTargetAccess,
} from "../authority/access";
import type { RequestContainer } from "../di/types";
import {
  type ManagedListingView,
  presentManagedListing,
  readViewContext,
  requireListing,
} from "./managedListing";

type Transition = (listing: Listing, now: Date) => WithEventDrafts<Listing>;

/**
 * A state change without a version in the request (`spec/usecases/listing.md`
 * 「共通の組み立て」): reads the listing (`NotFoundError` when gone), checks
 * who may do it before any write, applies `transition` (its
 * `BusinessRuleError` when the listing is already in that state), saves
 * against the version read and stores the events. A concurrent write
 * commits first → `ConflictError`.
 *
 * `by` is `"manager"` for `manage_target` on the listing's place, or
 * `"operator"` for `operate_service`.
 */
export async function transitionListing(
  container: RequestContainer,
  actor: Actor,
  listingId: ListingId,
  by: "manager" | "operator",
  transition: Transition,
): Promise<ManagedListingView> {
  const now = container.clock.now();
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    if (by === "operator") await authorizeRole(ctx, actor, "operate_service");
    const found = await requireListing(ctx, listingId);
    const target = { kind: "place", id: found.entity.placeId } as const;
    const access =
      by === "manager"
        ? await authorizeOnTarget(ctx, actor, "manage_target", target)
        : await readTargetAccess(ctx, actor, target);
    const view = await readViewContext(ctx, found.entity.placeId);
    const { entity, eventDrafts } = transition(found.entity, now);
    await ctx.listingRepository.save(entity, found.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return { ...view, access, listing: entity };
  });
  return presentManagedListing(container, read);
}
