import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  type ListingDetailData,
  type OccasionDetailData,
  OTHER_LISTINGS_LIMIT,
  PLACE_LISTINGS_PAGE_SIZE,
  type PlaceDetailData,
  type PlaceListingsPage,
  REGION_SECTION_LIMIT,
  type RegionDetailData,
  toListingDetailData,
  toOccasionDetailData,
  toPlaceDetailData,
  toPlaceListingsPage,
  toRegionDetailData,
} from "./detailView";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { classifyError } from "./errorState";
import { PAGINATION_MAX_PAGE } from "./pagination";
import type { ArticlesPage, WithArticles } from "./readingView";
import { validateInput } from "./validator";

/**
 * A detail loader's read, with a target that is not viewable (or an id
 * that cannot name one) turned into the route's not-found: CS-06, and an
 * HTTP 404 for the document.
 */
export async function orNotFound<T>(read: Promise<T>): Promise<T> {
  try {
    return await read;
  } catch (error) {
    const { kind } = classifyError(error);
    if (kind === "notFound" || kind === "invalidInput") throw notFound();
    throw error;
  }
}

/** A route's id segment: shape only — whether it names anything is the usecase's. */
const idParam = z.string().trim().min(1).max(128);

async function loadDeps() {
  const [{ getContainer }, { LocalDate }] = await Promise.all([
    import("@repo/core/application/di/containerStore"),
    import("@repo/core/domain/common/localDate"),
  ]);
  const container = await getContainer();
  return {
    container,
    today: LocalDate.fromInstant(container.clock.now()),
  };
}

/**
 * DT-01: the listing as viewers see it, with the first page of its
 * 読みもの section. `NotFoundError` (`LISTING_NOT_FOUND`) when it is not
 * viewable — the route answers CS-06 with HTTP 404.
 */
export const loadListingDetailFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ listingId: idParam })))
  .handler(async ({ data }): Promise<WithArticles<ListingDetailData>> => {
    const [
      { container, today },
      { viewListing },
      { ListingId },
      { loadShowcasingPage },
    ] = await Promise.all([
      loadDeps(),
      import("@repo/core/application/discovery/viewListing"),
      import("@repo/core/domain/common/ids"),
      import("./readingData"),
    ]);
    const [output, articles] = await Promise.all([
      viewListing({
        container,
        input: {
          listingId: ListingId.create(data.listingId),
          otherListingsLimit: OTHER_LISTINGS_LIMIT,
        },
      }),
      loadShowcasingPage({ kind: "listing", id: data.listingId }, 1),
    ]);
    return { ...toListingDetailData(output, today), articles };
  });

/** DT-02's first screen: the place and the first pages of its listings and 読みもの. */
export type PlaceDetailPage = Readonly<{
  place: PlaceDetailData;
  listings: PlaceListingsPage;
  articles: ArticlesPage;
}>;

/**
 * DT-02: the place as viewers see it, with the viewer's standing toward
 * it, and the first page of its listings. `NotFoundError`
 * (`PLACE_NOT_FOUND`) when it is suspended or missing.
 */
export const loadPlaceDetailFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ placeId: idParam })))
  .handler(async ({ data }): Promise<PlaceDetailPage> => {
    const [
      { container, today },
      { viewPlace },
      { listListingsOfPlace },
      { PlaceId },
      { resolveActor },
      { loadShowcasingPage },
    ] = await Promise.all([
      loadDeps(),
      import("@repo/core/application/discovery/viewPlace"),
      import("@repo/core/application/discovery/listListingsOfPlace"),
      import("@repo/core/domain/common/ids"),
      import("./actor"),
      import("./readingData"),
    ]);
    const placeId = PlaceId.create(data.placeId);
    const actor = await resolveActor(container);
    const [place, listings, articles] = await Promise.all([
      viewPlace({ container, actor, input: { placeId } }),
      listListingsOfPlace({
        container,
        input: {
          placeId,
          pagination: { page: 1, limit: PLACE_LISTINGS_PAGE_SIZE },
        },
      }),
      loadShowcasingPage({ kind: "place", id: data.placeId }, 1),
    ]);
    return {
      place: toPlaceDetailData(place, today),
      listings: toPlaceListingsPage(listings, today),
      articles,
    };
  });

export const placeListingsSchema = z.object({
  placeId: idParam,
  page: z.number().int().min(2).max(PAGINATION_MAX_PAGE),
});

/**
 * DT-02's listing section, continued (CF-05). `NotFoundError` when the
 * place stopped being viewable meanwhile (the screen then shows CS-06).
 */
export const listPlaceListingsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(placeListingsSchema))
  .handler(async ({ data }): Promise<PlaceListingsPage> => {
    const [{ container, today }, { listListingsOfPlace }, { PlaceId }] =
      await Promise.all([
        loadDeps(),
        import("@repo/core/application/discovery/listListingsOfPlace"),
        import("@repo/core/domain/common/ids"),
      ]);
    const output = await listListingsOfPlace({
      container,
      input: {
        placeId: PlaceId.create(data.placeId),
        pagination: { page: data.page, limit: PLACE_LISTINGS_PAGE_SIZE },
      },
    });
    return toPlaceListingsPage(output, today);
  });

/**
 * DT-03: the region as viewers see it, its linked occasions, and the first
 * places, listings and 読みもの of its sections. `NotFoundError`
 * (`REGION_NOT_FOUND`) when it is a draft, unpublished, suspended or
 * missing — the route answers CS-06 with HTTP 404.
 */
export const loadRegionDetailFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ regionId: idParam })))
  .handler(async ({ data }): Promise<WithArticles<RegionDetailData>> => {
    const [
      { container, today },
      { viewRegion },
      { listPlacesOfRegion },
      { listListingsOfRegion },
      { RegionId },
      { loadShowcasingPage },
    ] = await Promise.all([
      loadDeps(),
      import("@repo/core/application/discovery/viewRegion"),
      import("@repo/core/application/discovery/listPlacesOfRegion"),
      import("@repo/core/application/discovery/listListingsOfRegion"),
      import("@repo/core/domain/common/ids"),
      import("./readingData"),
    ]);
    const regionId = RegionId.create(data.regionId);
    const pagination = { page: 1, limit: REGION_SECTION_LIMIT };
    const [region, places, listings, articles] = await Promise.all([
      viewRegion({ container, input: { regionId } }),
      listPlacesOfRegion({ container, input: { regionId, pagination } }),
      listListingsOfRegion({ container, input: { regionId, pagination } }),
      loadShowcasingPage({ kind: "region", id: data.regionId }, 1),
    ]);
    return {
      ...toRegionDetailData(region, places, listings, today),
      articles,
    };
  });

/**
 * DT-04: the occasion as viewers see it, with its participants and their
 * attached listings and days, its linked regions and the first page of
 * its 読みもの section. `NotFoundError`
 * (`OCCASION_NOT_FOUND`) when it is a draft, unpublished, suspended or
 * missing — the route answers CS-06 with HTTP 404.
 */
export const loadOccasionDetailFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ occasionId: idParam })))
  .handler(async ({ data }): Promise<WithArticles<OccasionDetailData>> => {
    const [
      { container, today },
      { viewOccasion },
      { OccasionId },
      { resolveActor },
      { loadShowcasingPage },
    ] = await Promise.all([
      loadDeps(),
      import("@repo/core/application/discovery/viewOccasion"),
      import("@repo/core/domain/common/ids"),
      import("./actor"),
      import("./readingData"),
    ]);
    const actor = await resolveActor(container);
    const [output, articles] = await Promise.all([
      viewOccasion({
        container,
        actor,
        input: { occasionId: OccasionId.create(data.occasionId) },
      }),
      loadShowcasingPage({ kind: "occasion", id: data.occasionId }, 1),
    ]);
    return {
      ...toOccasionDetailData(output, today, actor !== null),
      articles,
    };
  });
