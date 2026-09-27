import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  type ListingDetailData,
  OTHER_LISTINGS_LIMIT,
  PLACE_LISTINGS_PAGE_SIZE,
  type PlaceDetailData,
  type PlaceListingsPage,
  toListingDetailData,
  toPlaceDetailData,
  toPlaceListingsPage,
} from "./detailView";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { classifyError } from "./errorState";
import { PAGINATION_MAX_PAGE } from "./pagination";
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
 * DT-01: the listing as viewers see it. `NotFoundError`
 * (`LISTING_NOT_FOUND`) when it is not viewable — the route answers CS-06
 * with HTTP 404.
 */
export const loadListingDetailFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ listingId: idParam })))
  .handler(async ({ data }): Promise<ListingDetailData> => {
    const [{ container, today }, { viewListing }, { ListingId }] =
      await Promise.all([
        loadDeps(),
        import("@repo/core/application/discovery/viewListing"),
        import("@repo/core/domain/common/ids"),
      ]);
    const output = await viewListing({
      container,
      input: {
        listingId: ListingId.create(data.listingId),
        otherListingsLimit: OTHER_LISTINGS_LIMIT,
      },
    });
    return toListingDetailData(output, today);
  });

/** DT-02's first screen: the place and the first page of its listings. */
export type PlaceDetailPage = Readonly<{
  place: PlaceDetailData;
  listings: PlaceListingsPage;
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
    ] = await Promise.all([
      loadDeps(),
      import("@repo/core/application/discovery/viewPlace"),
      import("@repo/core/application/discovery/listListingsOfPlace"),
      import("@repo/core/domain/common/ids"),
      import("./actor"),
    ]);
    const placeId = PlaceId.create(data.placeId);
    const actor = await resolveActor(container);
    const [place, listings] = await Promise.all([
      viewPlace({ container, actor, input: { placeId } }),
      listListingsOfPlace({
        container,
        input: {
          placeId,
          pagination: { page: 1, limit: PLACE_LISTINGS_PAGE_SIZE },
        },
      }),
    ]);
    return {
      place: toPlaceDetailData(place),
      listings: toPlaceListingsPage(listings, today),
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
