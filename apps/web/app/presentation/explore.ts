import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { browseCriteriaSchema } from "./browseSearch";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import type {
  EventsPage,
  RegionListingsPage,
  RegionPlacesPage,
  RegionsPage,
} from "./exploreView";
import { PAGINATION_MAX_PAGE } from "./pagination";
import { validateInput } from "./validator";

const pageField = z.number().int().min(1).max(PAGINATION_MAX_PAGE);
const regionIdField = z.string().trim().min(1).max(128);

/** The viewer's position as the browser reported it. */
export const originSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const findRegionsSchema = z.object({
  criteria: browseCriteriaSchema,
  origin: originSchema.nullable(),
  page: pageField,
});

/**
 * VW-05: a page of the regions of the chosen areas, else of the viewer's
 * vicinity when `origin` is given, else of all (CF-05, and the list read
 * again when the position is shared or stopped).
 */
export const findRegionsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(findRegionsSchema))
  .handler(async ({ data }): Promise<RegionsPage> => {
    const { loadRegionsPage } = await import("./exploreData");
    return loadRegionsPage(data.criteria, data.origin, data.page);
  });

/** VW-07: a page of the upcoming and ongoing occasions (CF-05). */
export const listEventsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ page: pageField })))
  .handler(async ({ data }): Promise<EventsPage> => {
    const { loadEventsPage } = await import("./exploreData");
    return loadEventsPage(data.page);
  });

export const regionListPageSchema = z.object({
  regionId: regionIdField,
  page: pageField,
});

/**
 * VW-06: a page of the region's places (CF-05). `NotFoundError` when the
 * region stopped being viewable meanwhile (the screen shows CS-06).
 */
export const listRegionPlacesFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(regionListPageSchema))
  .handler(async ({ data }): Promise<RegionPlacesPage> => {
    const { loadRegionPlacesPage } = await import("./exploreData");
    return loadRegionPlacesPage(data.regionId, data.page);
  });

/** VW-06: a page of the region's listings (see `listRegionPlacesFn`). */
export const listRegionListingsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(regionListPageSchema))
  .handler(async ({ data }): Promise<RegionListingsPage> => {
    const { loadRegionListingsPage } = await import("./exploreData");
    return loadRegionListingsPage(data.regionId, data.page);
  });
