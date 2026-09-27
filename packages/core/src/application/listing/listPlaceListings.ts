import type { PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { Pagination } from "@repo/core/domain/common/pagination";
import type { ListingShelf } from "@repo/core/domain/listing/listing";
import type { ListingShelfCounts } from "@repo/core/domain/listing/ports/listingRepository";
import { authorizeOnTarget } from "../authority/access";
import { NotFoundError } from "../errors";
import type { ActorServiceArgs } from "../types";
import {
  coverIds,
  displayRefsOf,
  type ListingRowView,
  listingRow,
} from "./managedListing";

export type ListPlaceListingsInput = Readonly<{
  placeId: PlaceId;
  /** `null` on an axis does not filter on it. */
  shelf: ListingShelf;
  pagination: Pagination;
}>;

export type PlaceListingsView = Readonly<{
  items: readonly ListingRowView[];
  /** Listings matching `shelf`. */
  count: number;
  /** Every listing of the place per publication shelf and per phase, whatever `shelf`. */
  counts: ListingShelfCounts;
}>;

/**
 * A place's listings for its managers, newest update first, filtered by
 * publication shelf and / or offering phase (today's), with the counts of
 * every shelf and phase (`spec/usecases/listing.md` 「listPlaceListings」;
 * LST-05, LST-11, LST-16, SHP-05). Drafts, unpublished, suspended and
 * proxy-made listings are all included.
 *
 * - `NotFoundError` when the place does not exist; `ForbiddenError`
 *   (`manage_target` on the place).
 */
export async function listPlaceListings({
  container,
  actor,
  input,
}: ActorServiceArgs<ListPlaceListingsInput>): Promise<PlaceListingsView> {
  const today = LocalDate.fromInstant(container.clock.now());
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const place = await ctx.placeRepository.findById(input.placeId);
    if (place === null) {
      throw new NotFoundError("PLACE_NOT_FOUND", "The place does not exist");
    }
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "place",
      id: input.placeId,
    });
    const [page, counts, catalog] = await Promise.all([
      ctx.listingRepository.findPageByPlace(
        input.placeId,
        input.shelf,
        today,
        Pagination.create(input.pagination),
      ),
      ctx.listingRepository.countByPlace(input.placeId, today),
      ctx.categoryCatalogRepository.find(),
    ]);
    return { page, counts, catalog: catalog.entity };
  });
  const refs = await displayRefsOf(container, coverIds(read.page.items));
  return {
    items: read.page.items.map((listing) =>
      listingRow(listing, read.catalog, refs, today),
    ),
    count: read.page.count,
    counts: read.counts,
  };
}
