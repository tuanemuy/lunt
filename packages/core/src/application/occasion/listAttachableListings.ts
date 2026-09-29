import type {
  ListingId,
  OccasionId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { Pagination } from "@repo/core/domain/common/pagination";
import { Listing } from "@repo/core/domain/listing/listing";
import type { OfferingStatus } from "@repo/core/domain/listing/offering";
import type { ListingName } from "@repo/core/domain/listing/values";
import type { ListingPhotoView } from "../listing/managedListing";
import { displayRefsOf } from "../place/photos";
import type { ActorServiceArgs } from "../types";
import { listingCover, listingCoverIds } from "./attachedListings";
import { requireOccasion } from "./managedOccasion";
import { authorizeAsPlaceOrOccasion } from "./participationAccess";
import { requireParticipantPlace } from "./participations";

export type ListAttachableListingsInput = Readonly<{
  occasionId: OccasionId;
  placeId: PlaceId;
  pagination: Pagination;
}>;

export type AttachableListingView = Readonly<{
  id: ListingId;
  name: ListingName | null;
  /** The listing's first photo. */
  cover: ListingPhotoView | null;
  offeringStatus: OfferingStatus;
}>;

export type AttachableListingsView = Readonly<{
  items: readonly AttachableListingView[];
  count: number;
}>;

/**
 * The place's attachable listings — the candidates for a participation's
 * listings — as `ListingRepository.findPageAttachable` returns them
 * (newest update first), each with its name, cover and offering status,
 * so the candidates and the check at a write
 * (`Listing.attachableIds`) follow one rule (`spec/usecases/occasion.md`
 * 「listAttachableListings」; EVT-01, EVT-02, EVT-10 / CM-04, RQ-06).
 *
 * - `NotFoundError` `OCCASION_NOT_FOUND` / `PLACE_NOT_FOUND`, checked
 *   before access.
 * - `ForbiddenError` unless `act_as_place` on the place or
 *   `manage_target` on the occasion allows.
 */
export async function listAttachableListings({
  container,
  actor,
  input,
}: ActorServiceArgs<ListAttachableListingsInput>): Promise<AttachableListingsView> {
  const pagination = Pagination.create(input.pagination);
  const today = LocalDate.fromInstant(container.clock.now());
  const page = await container.unitOfWorkProvider.run(async (ctx) => {
    await requireOccasion(ctx, input.occasionId);
    await requireParticipantPlace(ctx, input.placeId);
    await authorizeAsPlaceOrOccasion(
      ctx,
      actor,
      input.placeId,
      input.occasionId,
    );
    return ctx.listingRepository.findPageAttachable(
      input.placeId,
      today,
      pagination,
    );
  });
  const refs = await displayRefsOf(
    container.photoStorage,
    listingCoverIds(page.items),
  );
  return {
    items: page.items.map((listing) => ({
      id: listing.id,
      name: listing.content.name,
      cover: listingCover(listing, refs),
      offeringStatus: Listing.offeringStatus(listing, today),
    })),
    count: page.count,
  };
}
