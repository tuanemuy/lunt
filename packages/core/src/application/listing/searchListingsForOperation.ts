import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { ListingId, PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { Publication } from "@repo/core/domain/common/publication";
import { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import { Listing } from "@repo/core/domain/listing/listing";
import type { OfferingStatus } from "@repo/core/domain/listing/offering";
import type { ListingName } from "@repo/core/domain/listing/values";
import { Place } from "@repo/core/domain/place/place";
import type { PlaceName } from "@repo/core/domain/place/profile";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import {
  coverIds,
  displayRefsOf,
  type ListingPhotoView,
  photoView,
} from "./managedListing";

export type SearchListingsForOperationInput = Readonly<{
  keyword: string;
  pagination: Pagination;
}>;

export type OperationListingView = Readonly<{
  id: ListingId;
  name: ListingName | null;
  cover: ListingPhotoView | null;
  place: Readonly<{ id: PlaceId; name: PlaceName | null; suspended: boolean }>;
  /** Whether the place has a steward — without one the operator may stand in. */
  hasSteward: boolean;
  publication: Publication;
  suspended: boolean;
  offeringStatus: OfferingStatus;
}>;

export type OperationListingsView = Readonly<{
  items: readonly OperationListingView[];
  count: number;
}>;

/**
 * An operator searches every listing by keyword — drafts, unpublished,
 * suspended and those of suspended places included — most relevant first
 * (`spec/usecases/listing.md` 「searchListingsForOperation」; LST-16,
 * MOD-07). Each hit carries its place's name and suspension and whether
 * the place has a steward.
 *
 * - A blank keyword reads nothing and returns no hits;
 *   `COMMON_INVALID_SEARCH_KEYWORD` over 100 characters.
 * - `ForbiddenError` (`operate_service`).
 */
export async function searchListingsForOperation({
  container,
  actor,
  input,
}: ActorServiceArgs<SearchListingsForOperationInput>): Promise<OperationListingsView> {
  const keyword = SearchKeyword.parse(input.keyword);
  const today = LocalDate.fromInstant(container.clock.now());
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    if (keyword === null) return null;
    const page = await ctx.listingRepository.searchForOperation(
      keyword,
      input.pagination,
    );
    const placeIds = [...new Set(page.items.map((listing) => listing.placeId))];
    const [places, stewardships] = await Promise.all([
      ctx.placeRepository.findByIds(placeIds),
      ctx.stewardshipRepository.findByTargets(
        placeIds.map((id) => ({ kind: "place", id }) as const),
      ),
    ]);
    return { page, places, stewardships };
  });
  if (read === null) return { items: [], count: 0 };
  const places = new Map(read.places.map((place) => [place.id, place]));
  const stewarded = new Set(
    read.stewardships
      .filter((stewardship) => !Stewardship.isVacant(stewardship))
      .map((stewardship) => stewardship.target.id),
  );
  const refs = await displayRefsOf(container, coverIds(read.page.items));
  return {
    items: read.page.items.map((listing): OperationListingView => {
      const place = places.get(listing.placeId);
      const [cover] = listing.content.photos.items;
      return {
        id: listing.id,
        name: listing.content.name,
        cover: cover === undefined ? null : photoView(cover, refs),
        place: {
          id: listing.placeId,
          name: place?.profile.name ?? null,
          suspended: place === undefined ? false : Place.isSuspended(place),
        },
        hasSteward: stewarded.has(listing.placeId),
        publication: listing.publication,
        suspended: listing.suspension.suspended,
        offeringStatus: Listing.offeringStatus(listing, today),
      };
    }),
    count: read.page.count,
  };
}
