import { AreaSelection } from "@repo/core/domain/area/areaSelection";
import type { Address } from "@repo/core/domain/common/address";
import type { AreaCode } from "@repo/core/domain/common/areaCode";
import type { CategoryId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import {
  Listing,
  type PublishedListing,
} from "@repo/core/domain/listing/listing";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type { Place } from "@repo/core/domain/place/place";
import type { RegionFootprint } from "./regionFootprint";

/**
 * The chosen areas and categories. An empty list means no condition of
 * that kind.
 */
export type BrowseCriteria = Readonly<{
  areas: readonly AreaSelection[];
  categoryIds: readonly CategoryId[];
}>;

/**
 * Criteria ready for matching. `null` means no condition; an empty
 * `areaCodes` set matches nothing. `categoryIds` is compared with the
 * category id stored on a listing (retired ids included through
 * `CategoryCatalog.predecessorsOf`). `effective` is what the screen shows
 * as the conditions in force.
 */
export type ResolvedCriteria = Readonly<{
  areaCodes: ReadonlySet<AreaCode> | null;
  categoryIds: ReadonlySet<CategoryId> | null;
  effective: BrowseCriteria;
}>;

const NONE: ResolvedCriteria = {
  areaCodes: null,
  categoryIds: null,
  effective: { areas: [], categoryIds: [] },
};

/**
 * `expanded` is `AreaCatalog.expand` of the de-duplicated selections (the
 * usecase's read). Retired and unknown category ids drop out of the
 * condition without an error.
 */
function resolve(
  criteria: BrowseCriteria,
  expanded: ReadonlySet<AreaCode>,
  catalog: CategoryCatalog,
): ResolvedCriteria {
  const areas = AreaSelection.dedupe(criteria.areas);
  const active = [
    ...new Set(
      criteria.categoryIds.filter(
        (id) => CategoryCatalog.find(catalog, id)?.status === "active",
      ),
    ),
  ];
  return {
    areaCodes: areas.length === 0 ? null : expanded,
    categoryIds:
      active.length === 0
        ? null
        : new Set(
            active.flatMap((id) => CategoryCatalog.predecessorsOf(catalog, id)),
          ),
    effective: { areas, categoryIds: active },
  };
}

const inAreas = (
  areaCodes: ReadonlySet<AreaCode> | null,
  address: Address,
): boolean => areaCodes === null || areaCodes.has(address.areaCode);

const inCategories = (
  categoryIds: ReadonlySet<CategoryId> | null,
  listing: PublishedListing,
): boolean =>
  categoryIds === null || categoryIds.has(listing.content.categoryId);

/**
 * The browse conditions (`spec/domains/discovery.md` 「BrowseCriteria /
 * ResolvedCriteria」): the only definition of whether a target matches the
 * chosen areas and categories.
 */
export const BrowseCriteria = {
  none: (): ResolvedCriteria => NONE,
  resolve,
  /** No area condition, or the address's area is chosen. */
  inAreas,
  /** The place's area matches and the listing's stored category matches. */
  matchesListing: (
    resolved: ResolvedCriteria,
    listing: PublishedListing,
    place: Pick<Place, "profile">,
  ): boolean =>
    inAreas(resolved.areaCodes, place.profile.address) &&
    inCategories(resolved.categoryIds, listing),
  /**
   * The place's area matches and, with a category condition, one of its
   * viewable `listings` is `available` on `today` in a chosen category.
   */
  matchesPlace: (
    resolved: ResolvedCriteria,
    place: Pick<Place, "profile">,
    listings: readonly PublishedListing[],
    today: LocalDate,
  ): boolean =>
    inAreas(resolved.areaCodes, place.profile.address) &&
    (resolved.categoryIds === null ||
      listings.some(
        (listing) =>
          inCategories(resolved.categoryIds, listing) &&
          Listing.offeringStatus(listing, today).phase === "available",
      )),
  /**
   * Some point of the footprint (`RegionFootprint.of(…, "reference")`) is
   * in a chosen area. Categories never apply to regions.
   */
  matchesRegion: (
    areaCodes: ReadonlySet<AreaCode> | null,
    footprint: RegionFootprint,
  ): boolean =>
    areaCodes === null ||
    footprint.some((point) => areaCodes.has(point.address.areaCode)),
  /** The venue is in a chosen area. Categories never apply to occasions. */
  matchesOccasion: (
    resolved: ResolvedCriteria,
    occasion: PublishedOccasion,
  ): boolean => inAreas(resolved.areaCodes, occasion.content.venue.address),
};
