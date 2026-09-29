import { Stewardship } from "@repo/core/domain/authority/stewardship";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import type { ListingId } from "@repo/core/domain/common/ids";
import { Pagination } from "@repo/core/domain/common/pagination";
import type { ListingEntry } from "@repo/core/domain/discovery/entry";
import {
  type ListingDetail,
  type ListingSummary,
  type OccasionSummary,
  type RegionSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { BusinessRuleError } from "@repo/core/domain/error";
import {
  type ActiveCategory,
  CategoryCatalog,
} from "@repo/core/domain/listing/categoryCatalog";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import {
  listingSummaryPhotoIds,
  occasionSummaryPhotoIds,
  type PhotoRefs,
  photoRefsOf,
  placeSummaryPhotoIds,
  regionSummaryPhotoIds,
  todayOf,
} from "./views";

/** Thrown for a listing that is not viewable or does not exist (not told apart). */
export const LISTING_NOT_FOUND = "LISTING_NOT_FOUND";

export type ViewListingInput = Readonly<{
  listingId: ListingId;
  /**
   * How many other listings to show: an integer from 1 to
   * `MAX_OTHER_LISTINGS` (the place's are read one more than this, within
   * `Pagination.maxLimit`). Checked at the transport boundary and again here.
   */
  otherListingsLimit: number;
}>;

export const MAX_OTHER_LISTINGS = Pagination.maxLimit - 1;

export type ViewListingOutput = Readonly<{
  /** The listing as viewers see it, its category resolved to the active one. */
  listing: Omit<ListingDetail, "categoryId" | "regions"> &
    Readonly<{ category: ActiveCategory }>;
  /**
   * Every viewable region of the place: the displayed one first, then in
   * first-affiliated order.
   */
  regions: readonly RegionSummary[];
  /**
   * Upcoming and ongoing viewable occasions this listing is attached to, in
   * 「開催日の順」 (discovery scene).
   */
  occasions: readonly OccasionSummary[];
  /** `ViewProjection.pickOtherListings`, in discovery scene. */
  otherListings: readonly ListingSummary[];
  /** Whether the place has no steward — decides the procedures offered. */
  placeIsVacant: boolean;
  photos: PhotoRefs;
}>;

/**
 * DT-01 (EXP-06): a listing's detail with its place, regions, occasions and
 * other listings. The listing and its place are in the reference scene
 * (upcoming / ended listings and closed places show with their standing);
 * other listings and occasions are in the discovery scene. Needs no login.
 *
 * Other listings are the place's (read one more than the limit, so dropping
 * this listing still fills it) followed by those of other places in the
 * displayed region; without a displayed region, the place's only.
 *
 * @throws NotFoundError `LISTING_NOT_FOUND` when the listing is a draft,
 *   unpublished, suspended, deleted, at a suspended place, or missing —
 *   without telling which.
 * @throws BusinessRuleError `COMMON_INVALID_INPUT` when
 *   `otherListingsLimit` is out of bounds.
 */
export async function viewListing({
  container,
  input,
}: ServiceArgs<ViewListingInput>): Promise<ViewListingOutput> {
  if (
    !Number.isSafeInteger(input.otherListingsLimit) ||
    input.otherListingsLimit < 1 ||
    input.otherListingsLimit > MAX_OTHER_LISTINGS
  ) {
    throw new BusinessRuleError(
      CommonErrorCode.InvalidInput,
      `otherListingsLimit must be an integer from 1 to ${MAX_OTHER_LISTINGS}`,
    );
  }
  const today = todayOf(container);
  const entry = await container.detailQueries.findListing(input.listingId);
  if (entry === null) {
    throw new NotFoundError(LISTING_NOT_FOUND, "The listing is not viewable");
  }
  const { listing, place } = entry;
  const { catalog, stewardship } = await container.unitOfWorkProvider.run(
    async ({ categoryCatalogRepository, stewardshipRepository }) => {
      const target = { kind: "place", id: place.place.id } as const;
      const [catalog, stored] = await Promise.all([
        categoryCatalogRepository.find(),
        stewardshipRepository.findById(target),
      ]);
      return {
        catalog: catalog.entity,
        stewardship: Stewardship.orVacant(stored?.entity ?? null, target),
      };
    },
  );
  const samePlace = await container.detailQueries.findListingsOfPlace(
    { placeId: place.place.id, scene: "discovery", today },
    { page: 1, limit: input.otherListingsLimit + 1 },
  );
  const [displayed] = place.regions;
  const sameRegion: readonly ListingEntry[] =
    displayed === undefined
      ? []
      : (
          await container.explorationQueries.findListingsOfRegion(
            { regionId: displayed.id, excludingPlaceId: place.place.id, today },
            { page: 1, limit: input.otherListingsLimit },
          )
        ).items;
  const otherListings = ViewProjection.pickOtherListings(
    listing.id,
    samePlace.items,
    sameRegion,
    input.otherListingsLimit,
  ).map((other) =>
    ViewProjection.listingSummary(other, { kind: "displayed" }, today),
  );
  const occasions = (
    await container.detailQueries.findOccasionsRelatedTo(
      { kind: "listing", id: listing.id },
      today,
    )
  ).map((occasion) => ViewProjection.occasionSummary(occasion, today));

  const { categoryId, regions, ...detail } = ViewProjection.listingDetail(
    entry,
    today,
  );
  const photos = await photoRefsOf(container, [
    ...detail.photos.map((photo) => photo.photoId),
    ...placeSummaryPhotoIds(detail.place),
    ...regions.flatMap(regionSummaryPhotoIds),
    ...occasions.flatMap(occasionSummaryPhotoIds),
    ...otherListings.flatMap(listingSummaryPhotoIds),
  ]);
  return {
    listing: {
      ...detail,
      category: CategoryCatalog.resolve(catalog, categoryId),
    },
    regions,
    occasions,
    otherListings,
    placeIsVacant: Stewardship.isVacant(stewardship),
    photos,
  };
}
