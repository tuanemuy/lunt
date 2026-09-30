import type { LngLat, MapBounds, MapPin, MapViewport } from "./types";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * The visible range as valid coordinates. A zoomed-out map shows more than
 * the world's longitudes and the poles, which `GeoBounds` refuses.
 */
export function clampBounds(
  west: number,
  south: number,
  east: number,
  north: number,
): MapBounds {
  const w = clamp(west, -180, 180);
  const e = clamp(east, -180, 180);
  const s = clamp(south, -90, 90);
  const n = clamp(north, -90, 90);
  return {
    southWest: { latitude: Math.min(s, n), longitude: Math.min(w, e) },
    northEast: { latitude: Math.max(s, n), longitude: Math.max(w, e) },
  };
}

/** The middle of a range, e.g. where a cluster's pin sits. */
export function centerOf(bounds: MapBounds): LngLat {
  return {
    latitude: (bounds.southWest.latitude + bounds.northEast.latitude) / 2,
    longitude: (bounds.southWest.longitude + bounds.northEast.longitude) / 2,
  };
}

/** Value identity of a viewport: the map moves only when this changes. */
export function viewportKey(viewport: MapViewport): string {
  return viewport.kind === "bounds"
    ? [
        "b",
        viewport.bounds.southWest.latitude,
        viewport.bounds.southWest.longitude,
        viewport.bounds.northEast.latitude,
        viewport.bounds.northEast.longitude,
        viewport.maxZoom ?? "",
      ].join(":")
    : [
        "c",
        viewport.center.latitude,
        viewport.center.longitude,
        viewport.zoom,
      ].join(":");
}

/** The number a pin shows; a region shows its name instead. */
export function pinCount(pin: MapPin): number | null {
  switch (pin.kind) {
    case "target":
      return 1;
    case "colocated":
    case "cluster":
      return pin.count;
    case "region":
      return null;
  }
}

/** Whether the pin is a toggle (`aria-pressed`); a cluster only zooms. */
export function pinSelected(pin: MapPin): boolean | undefined {
  return pin.kind === "cluster" ? undefined : pin.selected;
}

/** Selected pins are drawn above the rest, regions above places. */
export function pinLayer(pin: MapPin): number {
  if (pinSelected(pin) === true) return 3;
  return pin.kind === "region" ? 2 : 1;
}
