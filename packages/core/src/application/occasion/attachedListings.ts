import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { ListingId, PhotoId, PlaceId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { Publication } from "@repo/core/domain/common/publication";
import { VisibilityPolicy } from "@repo/core/domain/discovery/visibilityPolicy";
import { Listing } from "@repo/core/domain/listing/listing";
import type { OfferingStatus } from "@repo/core/domain/listing/offering";
import type { ListingRepositories } from "@repo/core/domain/listing/ports/unitOfWork";
import type { ListingName } from "@repo/core/domain/listing/values";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import type { Place } from "@repo/core/domain/place/place";
import type { PlaceRepositories } from "@repo/core/domain/place/ports/unitOfWork";
import {
  type ListingPhotoView,
  photoView as listingPhotoView,
} from "../listing/managedListing";

/**
 * A listing attached to a participation, as the management reads show it
 * (`spec/usecases/occasion.md` 「操作の可否の確かめ方」): its state when it
 * still exists — `viewable` is `VisibilityPolicy.isListingViewable` with
 * the participation's place — and its cover (first photo), or `deleted`.
 */
export type AttachedListingView =
  | Readonly<{ id: ListingId; deleted: true }>
  | Readonly<{
      id: ListingId;
      deleted: false;
      name: ListingName | null;
      cover: ListingPhotoView | null;
      publication: Publication;
      suspended: boolean;
      offeringStatus: OfferingStatus;
      viewable: boolean;
    }>;

/** The stored listings among `ids`, looked up 100 at a time. */
export async function readListings(
  ctx: Pick<ListingRepositories, "listingRepository">,
  ids: readonly ListingId[],
): Promise<ReadonlyMap<ListingId, Listing>> {
  const unique = [...new Set(ids)];
  const batches = await Promise.all(
    IdBatch.chunks(unique).map((batch) =>
      ctx.listingRepository.findByIds(batch),
    ),
  );
  return new Map(batches.flat().map((listing) => [listing.id, listing]));
}

/** The covers of `listings`, for `PhotoStorage.displayRefs`. */
export const listingCoverIds = (
  listings: Iterable<Listing>,
): readonly PhotoId[] =>
  [...listings].flatMap((listing) => {
    const [cover] = listing.content.photos.items;
    return cover === undefined ? [] : [cover.photoId];
  });

/** A listing's cover with its display ref; `null` without photos. */
export const listingCover = (
  listing: Listing,
  refs: ReadonlyMap<PhotoId, PhotoDisplayRef>,
): ListingPhotoView | null => {
  const [cover] = listing.content.photos.items;
  return cover === undefined ? null : listingPhotoView(cover, refs);
};

/**
 * Every attached listing in attachment order; missing ones read as
 * deleted. `refs` holds the display refs of `listingCoverIds(listings)`.
 */
export function attachedListingViews(
  ids: readonly ListingId[],
  listings: ReadonlyMap<ListingId, Listing>,
  place: Place | null,
  today: LocalDate,
  refs: ReadonlyMap<PhotoId, PhotoDisplayRef>,
): readonly AttachedListingView[] {
  return ids.map((id): AttachedListingView => {
    const listing = listings.get(id);
    if (listing === undefined) return { id, deleted: true };
    return {
      id,
      deleted: false,
      name: listing.content.name,
      cover: listingCover(listing, refs),
      publication: listing.publication,
      suspended: listing.suspension.suspended,
      offeringStatus: Listing.offeringStatus(listing, today),
      viewable: VisibilityPolicy.isListingViewable(listing, place),
    };
  });
}

/** The places among `ids`, looked up 100 at a time. */
export async function readPlaces(
  ctx: PlaceRepositories,
  ids: readonly PlaceId[],
): Promise<ReadonlyMap<PlaceId, Place>> {
  const unique = [...new Set(ids)];
  const batches = await Promise.all(
    IdBatch.chunks(unique).map((batch) => ctx.placeRepository.findByIds(batch)),
  );
  return new Map(batches.flat().map((place) => [place.id, place]));
}
