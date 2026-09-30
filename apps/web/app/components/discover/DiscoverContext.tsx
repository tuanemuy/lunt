"use client";

import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useEffectEvent,
} from "react";
import {
  type CurrentLocation,
  useCurrentLocation,
} from "@/components/map/useCurrentLocation";
import { type FeedOrigin, feedOrigin } from "./feedOrigin";
import type { FeedSaves } from "./feedSaves";

export type DiscoverContextValue = Readonly<{
  /** The browser's answer to 「現在地の利用を始める」. */
  location: CurrentLocation;
  /** The position the feed is ordered by, `null` for newest first. */
  origin: FeedOrigin | null;
  start: () => void;
  /** Stops using the position: the feed goes back to newest first. */
  stop: () => void;
  /** The account's saves of every listing shown, read with the route (CF-04). */
  saves: FeedSaves | null;
}>;

const DiscoverContext = createContext<DiscoverContextValue | null>(null);

export function useDiscover(): DiscoverContextValue {
  const value = use(DiscoverContext);
  if (value === null) {
    throw new Error("useDiscover needs a DiscoverProvider");
  }
  return value;
}

function permissionState(): Promise<PermissionState | null> {
  const permissions =
    typeof navigator === "undefined" ? undefined : navigator.permissions;
  if (permissions === undefined) return Promise.resolve(null);
  return permissions
    .query({ name: "geolocation" })
    .then((status) => status.state)
    .catch(() => null);
}

/**
 * VW-01's position (DIS-06) above the streamed feed, so it outlives a
 * change of conditions: resumes by itself when the browser already grants
 * the permission, and forgets the position the feed was ordered by once
 * the permission is gone (「許可を取り消した後に開く」) or the position cannot
 * be had (CS-03). Each change of the position calls `onOriginChange`, which
 * reads the feed again.
 */
export function DiscoverProvider({
  origin,
  saves,
  onOriginChange,
  children,
}: {
  /** The position the loaded feed was ordered by. */
  origin: FeedOrigin | null;
  saves: FeedSaves | null;
  onOriginChange: () => void;
  children: ReactNode;
}) {
  const { location, start, stop } = useCurrentLocation({
    resumeWhenGranted: true,
  });
  const setOrigin = useEffectEvent((next: FeedOrigin | null) => {
    if (feedOrigin.set(next)) onOriginChange();
  });

  useEffect(() => {
    let active = true;
    void permissionState().then((state) => {
      if (active && state !== null && state !== "granted") setOrigin(null);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (location.status === "on") setOrigin(location.position);
    else if (location.status === "unavailable") setOrigin(null);
  }, [location]);

  const value: DiscoverContextValue = {
    location,
    origin: location.status === "on" ? (origin ?? location.position) : origin,
    start,
    stop: () => {
      stop();
      if (feedOrigin.set(null)) onOriginChange();
    },
    saves,
  };
  return <DiscoverContext value={value}>{children}</DiscoverContext>;
}
