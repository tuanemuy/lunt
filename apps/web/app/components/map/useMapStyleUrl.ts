"use client";

import { useEffect, useState } from "react";
import { loadMapStyleFn } from "@/presentation/mapStyle";
import { DEFAULT_MAP_STYLE_URL } from "./mapStyle";

let pending: Promise<string> | null = null;

function fetchStyleUrl(): Promise<string> {
  pending ??= loadMapStyleFn()
    .then(({ styleUrl }) => styleUrl)
    .catch((reason: unknown) => {
      // The next map asks again; this one draws the default tiles, and
      // MapCanvas falls back (CS-02) if those are unreachable as well.
      console.warn("[map] style setting unavailable", reason);
      pending = null;
      return DEFAULT_MAP_STYLE_URL;
    });
  return pending;
}

/**
 * The configured style URL for a map inside a screen whose loader does not
 * read it (the position field of the edit forms, CF-09): asked once per
 * page load, `null` until the answer arrives.
 */
export function useMapStyleUrl(): string | null {
  const [styleUrl, setStyleUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetchStyleUrl().then((url) => {
      if (active) setStyleUrl(url);
    });
    return () => {
      active = false;
    };
  }, []);
  return styleUrl;
}
