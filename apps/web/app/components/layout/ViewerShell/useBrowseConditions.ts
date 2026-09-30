"use client";

import { useLocation } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";
import {
  type BrowseSearch,
  browseCriteriaOf,
  browseSearchKey,
  browseSearchOf,
  browseSearchSchema,
} from "@/presentation/browseSearch";

/** The screens the browse conditions apply to (VW-01, VW-04, VW-05). */
export const BROWSE_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/map",
  "/regions",
]);

const NONE: BrowseSearch = {};
let remembered: BrowseSearch = NONE;
const listeners = new Set<() => void>();

function remember(next: BrowseSearch): void {
  if (browseSearchKey(next) === browseSearchKey(remembered)) return;
  remembered = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * The conditions last shown on VW-01, VW-04 or VW-05 in this tab, for the
 * navigation to carry between them (CF-03: 「条件は閲覧中の画面の間で保ち、
 * 再訪時には保たない」). In memory only: a new tab, or a reload away from
 * those screens, starts without them.
 */
export function useBrowseConditions(): BrowseSearch {
  const { pathname, area, cat } = useLocation({
    select: (location) => ({
      pathname: location.pathname,
      ...browseSearchSchema.parse(location.search),
    }),
  });
  const onBrowse = BROWSE_PATHS.has(pathname);
  useEffect(() => {
    if (!onBrowse) return;
    remember(browseSearchOf(browseCriteriaOf({ area, cat })));
  }, [onBrowse, area, cat]);
  return useSyncExternalStore(
    subscribe,
    () => remembered,
    () => NONE,
  );
}
