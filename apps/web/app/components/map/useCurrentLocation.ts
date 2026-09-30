"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LngLat } from "./types";

/**
 * Why the position is not in use (CS-03): the viewer refused, the device
 * has no location service, or it could not tell the position in time.
 */
export type LocationUnavailableReason = "denied" | "unsupported" | "failed";

export type CurrentLocation =
  | Readonly<{ status: "off" }>
  | Readonly<{ status: "locating" }>
  | Readonly<{ status: "on"; position: LngLat; accuracyMeters: number }>
  | Readonly<{ status: "unavailable"; reason: LocationUnavailableReason }>;

/** `GeolocationPositionError.PERMISSION_DENIED`. */
const PERMISSION_DENIED = 1;

/** A refusal stays a refusal; position-unavailable and timeout may retry. */
export function locationFailure(code: number): LocationUnavailableReason {
  return code === PERMISSION_DENIED ? "denied" : "failed";
}

const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 60_000,
};

type Options = Readonly<{
  /**
   * Starts by itself when the browser already grants the permission
   * (「すでに許可している状態で開く」). Never prompts on its own.
   */
  resumeWhenGranted?: boolean;
}>;

/**
 * The viewer's position for 「現在地の利用を始める」: `start` asks the
 * browser (which prompts the first time), `stop` stops using it. Nothing
 * is stored; a new page asks again unless `resumeWhenGranted` finds the
 * permission granted.
 */
export function useCurrentLocation({
  resumeWhenGranted = false,
}: Options = {}) {
  const [location, setLocation] = useState<CurrentLocation>({ status: "off" });
  const request = useRef(0);

  const start = useCallback(() => {
    // Absent on some devices and in some embedded browsers despite the type.
    const geolocation: Geolocation | null | undefined =
      typeof navigator === "undefined" ? undefined : navigator.geolocation;
    if (!geolocation) {
      setLocation({ status: "unavailable", reason: "unsupported" });
      return;
    }
    const current = ++request.current;
    setLocation({ status: "locating" });
    geolocation.getCurrentPosition(
      (position) => {
        if (current !== request.current) return;
        setLocation({
          status: "on",
          position: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          accuracyMeters: position.coords.accuracy,
        });
      },
      (error) => {
        if (current !== request.current) return;
        setLocation({
          status: "unavailable",
          reason: locationFailure(error.code),
        });
      },
      POSITION_OPTIONS,
    );
  }, []);

  const stop = useCallback(() => {
    request.current++;
    setLocation({ status: "off" });
  }, []);

  useEffect(() => {
    if (!resumeWhenGranted) return;
    const permissions =
      typeof navigator === "undefined" ? undefined : navigator.permissions;
    if (permissions === undefined) return;
    let active = true;
    permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (active && status.state === "granted") start();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [resumeWhenGranted, start]);

  return { location, start, stop } as const;
}
