import { ListingId, type PlaceId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import {
  ListingContent,
  type ListingContentInput,
} from "@repo/core/domain/listing/content";
import { Listing } from "@repo/core/domain/listing/listing";
import { authorizeOnTarget } from "../authority/access";
import { ConflictError, NotFoundError } from "../errors";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import {
  type ManagedListingView,
  presentManagedListing,
} from "./managedListing";
import { claimListingPhotos } from "./photos";

export type CreateListingDraftInput = Readonly<{
  /** Minted by the caller and resent unchanged on failure. */
  listingId: GeneratedId;
  placeId: PlaceId;
  content: ListingContentInput;
}>;

/** The id is taken by another listing, or by a deleted one. */
export const LISTING_ID_CONFLICT = "LISTING_ID_CONFLICT";

/**
 * A manager (or the operator standing in for an absent one) drafts a
 * listing of a place (`spec/usecases/listing.md` 「createListingDraft」;
 * LST-01, LST-02, LST-03, LST-15). Only the place is required; the publish
 * condition is not checked. The photos' owner becomes the listing in the
 * same unit of work. No domain event.
 *
 * Idempotent create: the same id with the same place and content succeeds
 * without writing and returns the listing as it now is (published or not).
 *
 * - `ForbiddenError` (`manage_target` on the place, also when it no longer
 *   holds at commit); `NotFoundError` when the place does not exist.
 * - `BusinessRuleError`: `LISTING_CATEGORY_NOT_AVAILABLE`, the content's
 *   value objects (`LISTING_INVALID_NAME`, `LISTING_DUPLICATE_PHOTO`,
 *   `LISTING_INVALID_OFFERING_PERIOD`, `LISTING_INVALID_OPEN_DATES`, …) and
 *   the photos' (`MEDIA_PHOTO_NOT_AVAILABLE`, `MEDIA_PHOTO_NOT_REGISTRANT`,
 *   `MEDIA_PHOTO_ALREADY_OWNED`).
 * - `ConflictError` when the id holds other content or a deleted listing.
 */
export async function createListingDraft({
  container,
  actor,
  input,
}: ActorServiceArgs<CreateListingDraftInput>): Promise<ManagedListingView> {
  const content = ListingContent.create(input.content);
  const id = ListingId.create(input.listingId);
  const now = container.clock.now();
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const access = await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "place",
      id: input.placeId,
    });
    const place = await ctx.placeRepository.findById(input.placeId);
    if (place === null) {
      throw new NotFoundError("PLACE_NOT_FOUND", "The place does not exist");
    }
    const view = {
      catalog: (await ctx.categoryCatalogRepository.find()).entity,
      place: place.entity,
    };
    const existing = await ctx.listingRepository.findById(id);
    if (existing !== null) {
      if (
        existing.entity.placeId !== input.placeId ||
        !ListingContent.equals(existing.entity.content, content)
      ) {
        throw new ConflictError(
          LISTING_ID_CONFLICT,
          "The listing id is already used for other content",
        );
      }
      return { ...view, access, listing: existing.entity };
    }
    const { entity } = Listing.createDraft(
      { id, placeId: input.placeId, content },
      view.catalog,
      now,
    );
    await claimListingPhotos(ctx, id, PhotoSet.photoIds(content.photos), actor);
    await ctx.listingRepository.insert(entity);
    return { ...view, access, listing: entity };
  });
  return presentManagedListing(container, read);
}
