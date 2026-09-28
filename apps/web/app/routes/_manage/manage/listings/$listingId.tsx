import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveListingPlaceFn } from "@/presentation/landing";

/**
 * The notification landing of a listing (`notificationDestination.ts`):
 * opens SM-04 under the listing's store, where the store's guard decides
 * between its stewards and the absence proxy.
 */
export const Route = createFileRoute("/_manage/manage/listings/$listingId")({
  beforeLoad: async ({ params }) => {
    const { placeId } = await resolveListingPlaceFn({
      data: { listingId: params.listingId },
    });
    throw redirect({
      to: "/manage/places/$placeId/listings/$listingId",
      params: { placeId, listingId: params.listingId },
      replace: true,
    });
  },
});
