import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { validateInput } from "./validator";

/**
 * The store of a listing, for the notification landing
 * `/manage/listings/$listingId` (`notificationDestination.ts`), which opens
 * SM-04 under it. Whoever may inspect the store — its stewards, an
 * operator — gets it; `NotFoundError` for a listing that is gone,
 * `ForbiddenError` otherwise.
 */
export const resolveListingPlaceFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(z.object({ listingId: z.string().trim().min(1).max(128) })),
  )
  .handler(async ({ data }): Promise<{ placeId: string }> => {
    const [
      { getContainer },
      { requireActor },
      { getManagedListing },
      { listingIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/listing/getManagedListing"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const view = await getManagedListing({
      container,
      actor,
      input: { listingId: listingIdOf(data.listingId) },
    });
    return { placeId: view.place.id };
  });
