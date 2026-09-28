import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveConfirmationRequestPlaceFn } from "@/presentation/moderation";

/**
 * The notification landing of a confirmation request
 * (`notificationDestination.ts`): opens SM-07 under the request's store.
 */
export const Route = createFileRoute("/_manage/manage/checks/$reportId")({
  beforeLoad: async ({ params }) => {
    const { placeId } = await resolveConfirmationRequestPlaceFn({
      data: { reportId: params.reportId },
    });
    throw redirect({
      to: "/manage/places/$placeId/checks/$reportId",
      params: { placeId, reportId: params.reportId },
      replace: true,
    });
  },
});
