import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import type { OfferingStatus, PublicationView } from "./listingView";
import { paginationSchema } from "./pagination";
import type { OperatingStatus } from "./placeView";
import type { HoldingStatus } from "./regionView";
import { validateInput } from "./validator";

/** Characters of a search term (the keyword's own limit is 100). */
const TERM_MAX = 100;

const termField = z.string().max(TERM_MAX);

/**
 * OM-02's URL: `kind=place` with `name` / `address`, or `kind=keyword`
 * with `q` (listings, regions and events). A hand-edited value falls back
 * to the empty search.
 */
export const opsSearchSearchSchema = z.object({
  kind: z.enum(["place", "keyword"]).optional().catch(undefined),
  name: termField.optional().catch(undefined),
  address: termField.optional().catch(undefined),
  q: termField.optional().catch(undefined),
});

export type OpsSearch = z.infer<typeof opsSearchSearchSchema>;

/** One store of OM-02's results. */
export type PlaceMatchItem = Readonly<{
  placeId: string;
  name: string;
  address: string;
  operatingStatus: OperatingStatus;
  suspended: boolean;
  hasSteward: boolean;
}>;

/** One listing of OM-02's results. */
export type ListingMatchItem = Readonly<{
  listingId: string;
  name: string | null;
  placeId: string;
  placeName: string | null;
  publication: PublicationView;
  suspended: boolean;
  offeringStatus: OfferingStatus;
  hasSteward: boolean;
}>;

/** One region of OM-02's keyword results. */
export type RegionMatchItem = Readonly<{
  regionId: string;
  name: string | null;
  /** The address text, or `null` while the region has none. */
  address: string | null;
  publication: PublicationView;
  suspended: boolean;
  hasSteward: boolean;
}>;

/** One event of OM-02's keyword results. */
export type OccasionMatchItem = Readonly<{
  occasionId: string;
  name: string | null;
  publication: PublicationView;
  suspended: boolean;
  holdingStatus: HoldingStatus | null;
  hasSteward: boolean;
}>;

export type MatchPage<T> = Readonly<{ items: readonly T[]; count: number }>;

/** Results per OM-02 page (CF-05). */
export const OPS_SEARCH_PAGE_SIZE = 20;

export const searchPlacesSchema = paginationSchema.extend({
  name: termField,
  address: termField,
});

/** OM-02: a further page of stores matching name / address. */
export const searchPlacesFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(searchPlacesSchema))
  .handler(async ({ data }): Promise<MatchPage<PlaceMatchItem>> => {
    const { searchPlaces } = await import("./opsData");
    return searchPlaces(data.name, data.address, {
      page: data.page,
      limit: data.limit,
    });
  });

export const searchListingsSchema = paginationSchema.extend({
  q: termField,
});

/** OM-02: a further page of listings matching the keyword. */
export const searchListingsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(searchListingsSchema))
  .handler(async ({ data }): Promise<MatchPage<ListingMatchItem>> => {
    const { searchListings } = await import("./opsData");
    return searchListings(data.q, { page: data.page, limit: data.limit });
  });

/** OM-02: a further page of regions matching the keyword. */
export const searchRegionsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(searchListingsSchema))
  .handler(async ({ data }): Promise<MatchPage<RegionMatchItem>> => {
    const { searchRegions } = await import("./opsData");
    return searchRegions(data.q, { page: data.page, limit: data.limit });
  });

/** OM-02: a further page of events matching the keyword. */
export const searchOccasionsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(searchListingsSchema))
  .handler(async ({ data }): Promise<MatchPage<OccasionMatchItem>> => {
    const { searchOccasions } = await import("./opsData");
    return searchOccasions(data.q, { page: data.page, limit: data.limit });
  });
