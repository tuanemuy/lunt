import type { ListingId, PhotoId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { Publication } from "@repo/core/domain/common/publication";
import {
  type ListingPreview,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { Listing } from "@repo/core/domain/listing/listing";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import { Place } from "@repo/core/domain/place/place";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import {
  type CategoryView,
  categoryView,
  displayRefsOf,
  readViewContext,
  requireListing,
} from "./managedListing";

export type PreviewListingInput = Readonly<{ listingId: ListingId }>;

export type ListingPreviewView = Readonly<{
  /** The viewer-facing summary and detail (`ViewProjection.previewListing`). */
  preview: ListingPreview;
  /** The detail's category, resolved to an active one. */
  category: CategoryView | null;
  /** Display refs of the listing's photos (cover included). */
  photoRefs: ReadonlyMap<PhotoId, PhotoDisplayRef>;
  publication: Publication;
  suspended: boolean;
  placeSuspended: boolean;
}>;

/**
 * The stored content shaped exactly as viewers would see it, in any
 * publication state — to check a draft or an unpublished listing before
 * publishing (`spec/usecases/listing.md` 「previewListing」; LST-04, LST-15).
 * Also returns what decides whether it can be shown: the publication
 * state, the suspension and the place's. Nothing is written.
 *
 * - `NotFoundError` when deleted; `ForbiddenError` (`manage_target` on the
 *   place).
 */
export async function previewListing({
  container,
  actor,
  input,
}: ActorServiceArgs<PreviewListingInput>): Promise<ListingPreviewView> {
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireListing(ctx, input.listingId);
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "place",
      id: found.entity.placeId,
    });
    const view = await readViewContext(ctx, found.entity.placeId);
    // Region affiliations land with Region (stage 3); until then none.
    return { ...view, listing: found.entity, affiliations: null, regions: [] };
  });
  const { listing, place, catalog } = read;
  const today = LocalDate.fromInstant(container.clock.now());
  const preview = ViewProjection.previewListing(
    {
      content: listing.content,
      manualEnd: Listing.manualEndOf(listing),
      place,
      affiliations: read.affiliations,
      regions: read.regions,
    },
    today,
  );
  return {
    preview,
    category: categoryView(catalog, listing),
    photoRefs: await displayRefsOf(
      container,
      listing.content.photos.items.map((photo) => photo.photoId),
    ),
    publication: listing.publication,
    suspended: listing.suspension.suspended,
    placeSuspended: Place.isSuspended(place),
  };
}
