import { getRouteApi } from "@tanstack/react-router";
import type { PlaceFrame } from "@/presentation/placeView";

const placeRoute = getRouteApi("/_manage/manage/places/$placeId");

/**
 * The store the SM screens manage, as `/manage/places/$placeId`'s guard
 * read it (`loadPlaceFrameFn`). Refreshed whenever the route reconciles.
 */
export function usePlaceFrame(): PlaceFrame {
  return placeRoute.useRouteContext({ select: (context) => context.frame });
}
