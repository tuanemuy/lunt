import { getRouteApi } from "@tanstack/react-router";
import type { RegionFrame } from "@/presentation/regionView";

const regionRoute = getRouteApi("/_manage/manage/regions/$regionId");

/**
 * The region the RM screens manage, as `/manage/regions/$regionId`'s guard
 * read it (`loadRegionFrameFn`). Refreshed whenever the route reconciles.
 */
export function useRegionFrame(): RegionFrame {
  return regionRoute.useRouteContext({ select: (context) => context.frame });
}
