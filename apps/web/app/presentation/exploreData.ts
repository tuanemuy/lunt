// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { labelAreaSelections } from "@repo/core/application/area/labelAreaSelections";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import type { BrowseCriteriaInput } from "@repo/core/application/discovery/criteria";
import { findRegions } from "@repo/core/application/discovery/findRegions";
import { listListingsOfRegion } from "@repo/core/application/discovery/listListingsOfRegion";
import { listOccasions } from "@repo/core/application/discovery/listOccasions";
import { listPlacesOfRegion } from "@repo/core/application/discovery/listPlacesOfRegion";
import { viewRegion } from "@repo/core/application/discovery/viewRegion";
import type { PointInput } from "@repo/core/application/discovery/views";
import { NotFoundError } from "@repo/core/application/errors";
import { listCategories } from "@repo/core/application/listing/listCategories";
import { RegionId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import {
  type ConditionItem,
  EVENTS_PAGE_SIZE,
  type EventsPage,
  REGION_LIST_PAGE_SIZE,
  REGIONS_PAGE_SIZE,
  type RegionListingsPage,
  type RegionListScreen,
  type RegionListTab,
  type RegionPlacesPage,
  type RegionsPage,
  toConditionItems,
  toEventsPage,
  toRegionListingsPage,
  toRegionPlacesPage,
  toRegionsPage,
} from "./exploreView";

const todayOf = (container: RequestContainer): LocalDate =>
  LocalDate.fromInstant(container.clock.now());

/** A page of VW-05: the regions of the areas, else the vicinity of `origin`, else all. */
export async function loadRegionsPage(
  criteria: BrowseCriteriaInput,
  origin: PointInput | null,
  page: number,
): Promise<RegionsPage> {
  const container = await getContainer();
  const output = await findRegions({
    container,
    input: { criteria, origin, pagination: { page, limit: REGIONS_PAGE_SIZE } },
  });
  return toRegionsPage(output);
}

/** CF-03's chips for the conditions in `criteria` (VW-01, VW-04, VW-05). */
export async function loadConditionItems(
  criteria: BrowseCriteriaInput,
): Promise<readonly ConditionItem[]> {
  if (criteria.areas.length === 0 && criteria.categoryIds.length === 0) {
    return [];
  }
  const container = await getContainer();
  const [areas, categories] = await Promise.all([
    labelAreaSelections({ container, input: { selections: criteria.areas } }),
    criteria.categoryIds.length === 0
      ? Promise.resolve([])
      : listCategories({ container }),
  ]);
  return toConditionItems(areas, categories, criteria.categoryIds);
}

/** VW-05's first screen without the viewer's position, and its CF-03 chips. */
export async function loadRegionsScreen(criteria: BrowseCriteriaInput) {
  const [page, conditions] = await Promise.all([
    loadRegionsPage(criteria, null, 1),
    loadConditionItems(criteria),
  ]);
  return { page, conditions };
}

/** A page of VW-07. */
export async function loadEventsPage(page: number): Promise<EventsPage> {
  const container = await getContainer();
  const output = await listOccasions({
    container,
    input: { pagination: { page, limit: EVENTS_PAGE_SIZE } },
  });
  return toEventsPage(output, todayOf(container));
}

/** A page of VW-06's places. `NotFoundError` when the region is not viewable. */
export async function loadRegionPlacesPage(
  regionId: string,
  page: number,
): Promise<RegionPlacesPage> {
  const container = await getContainer();
  const output = await listPlacesOfRegion({
    container,
    input: {
      regionId: RegionId.create(regionId),
      pagination: { page, limit: REGION_LIST_PAGE_SIZE },
    },
  });
  return toRegionPlacesPage(output);
}

/** A page of VW-06's listings. `NotFoundError` when the region is not viewable. */
export async function loadRegionListingsPage(
  regionId: string,
  page: number,
): Promise<RegionListingsPage> {
  const container = await getContainer();
  const output = await listListingsOfRegion({
    container,
    input: {
      regionId: RegionId.create(regionId),
      pagination: { page, limit: REGION_LIST_PAGE_SIZE },
    },
  });
  return toRegionListingsPage(output, todayOf(container));
}

/**
 * VW-06's first screen. A region that is a draft, unpublished, suspended
 * or missing is CS-06, told apart here
 * because an error thrown inside the streamed render reaches the browser
 * redacted.
 */
export async function loadRegionListScreen(
  regionId: string,
  tab: RegionListTab,
): Promise<RegionListScreen> {
  const container = await getContainer();
  try {
    const id = RegionId.create(regionId);
    const [view, screen] = await Promise.all([
      viewRegion({ container, input: { regionId: id } }),
      tab === "places"
        ? loadRegionPlacesPage(regionId, 1).then(
            (first) => ({ kind: "places", first }) as const,
          )
        : loadRegionListingsPage(regionId, 1).then(
            (first) => ({ kind: "listings", first }) as const,
          ),
    ]);
    return {
      ...screen,
      regionId: view.region.regionId,
      name: view.region.name,
    };
  } catch (error) {
    if (error instanceof NotFoundError) return { kind: "unavailable" };
    throw error;
  }
}
