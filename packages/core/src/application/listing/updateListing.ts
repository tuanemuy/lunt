import type { ListingId, PhotoId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import {
  ListingContent,
  type ListingContentInput,
} from "@repo/core/domain/listing/content";
import { Listing } from "@repo/core/domain/listing/listing";
import { authorizeOnTarget } from "../authority/access";
import { ConflictError } from "../errors";
import type { ActorServiceArgs } from "../types";
import {
  type ManagedListingView,
  presentManagedListing,
  readViewContext,
  requireListing,
} from "./managedListing";
import { claimListingPhotos } from "./photos";

export type UpdateListingInput = Readonly<{
  listingId: ListingId;
  /** The listing's version when editing started. */
  version: number;
  content: ListingContentInput;
}>;

/** Someone saved the listing after this edit started. */
export const LISTING_EDIT_CONFLICT = "LISTING_EDIT_CONFLICT";

const added = (
  before: ListingContent,
  after: ListingContent,
): readonly PhotoId[] => {
  const kept = new Set(PhotoSet.photoIds(before.photos));
  return PhotoSet.photoIds(after.photos).filter((id) => !kept.has(id));
};

/**
 * Saves a listing's content in any publication state and while suspended
 * (`spec/usecases/listing.md` 「updateListing」; LST-02, LST-03, LST-06,
 * LST-11, LST-16, MOD-03, MOD-06). A published listing shows the new
 * content at once and must keep meeting the publish condition. Added
 * photos become the listing's; removed ones are released
 * (`photos.released`). Unchanged content writes nothing.
 *
 * - `NotFoundError` when the listing was deleted; `ForbiddenError`
 *   (`manage_target` on its place); `ConflictError` when `version` is not
 *   the stored one or a concurrent save commits first.
 * - `BusinessRuleError`: `LISTING_PUBLISH_CONDITION_UNMET` (with what is
 *   missing), `LISTING_CATEGORY_NOT_AVAILABLE`, the content's value objects
 *   and the added photos' (`MEDIA_PHOTO_*`).
 */
export async function updateListing({
  container,
  actor,
  input,
}: ActorServiceArgs<UpdateListingInput>): Promise<ManagedListingView> {
  const content = ListingContent.create(input.content);
  const now = container.clock.now();
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireListing(ctx, input.listingId);
    const access = await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "place",
      id: found.entity.placeId,
    });
    if (found.entity.version !== input.version) {
      throw new ConflictError(
        LISTING_EDIT_CONFLICT,
        "The listing was saved after this edit started",
      );
    }
    const view = await readViewContext(ctx, found.entity.placeId);
    const { entity, eventDrafts } = Listing.update(
      found.entity,
      content,
      view.catalog,
      now,
    );
    if (entity !== found.entity) {
      await claimListingPhotos(
        ctx,
        entity.id,
        added(found.entity.content, entity.content),
        actor,
      );
      await ctx.listingRepository.save(entity, found.expectedVersion);
      ctx.collectEvents(eventDrafts);
    }
    return { ...view, access, listing: entity };
  });
  return presentManagedListing(container, read);
}
