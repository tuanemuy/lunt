import { getRouteApi } from "@tanstack/react-router";
import type { OccasionFrame } from "@/presentation/occasionView";

const occasionRoute = getRouteApi("/_manage/manage/events/$occasionId");

/**
 * The event the EM screens manage, as `/manage/events/$occasionId`'s guard
 * read it (`loadOccasionFrameFn`). Refreshed whenever the route reconciles.
 */
export function useOccasionFrame(): OccasionFrame {
  return occasionRoute.useRouteContext({ select: (context) => context.frame });
}
