import type { LngLat, MapBounds } from "@/components/map/types";

/** Where the picker opens when nothing is chosen yet: the whole of Japan. */
export const JAPAN_BOUNDS: MapBounds = {
  southWest: { latitude: 24.0, longitude: 122.9 },
  northEast: { latitude: 45.6, longitude: 146.0 },
};

/** How close the picker and the preview look at a chosen point. */
export const POINT_ZOOM = 16;

const coordinate = (text: string, limit: number): number | null => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
};

/**
 * The point the form's two texts name, or `null` while either is blank,
 * not a number or out of range (the form's own check reports why).
 */
export function parsePosition(
  latitude: string,
  longitude: string,
): LngLat | null {
  const lat = coordinate(latitude, 90);
  const lng = coordinate(longitude, 180);
  return lat === null || lng === null
    ? null
    : { latitude: lat, longitude: lng };
}

/** A picked degree as the form's text: six decimals (about 0.1 m), no trailing zeros. */
export function formatCoordinate(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

/** 北緯 35.68120、東経 139.76710 (南緯 / 西経 below zero). */
export function positionText(point: LngLat): string {
  const lat = `${point.latitude < 0 ? "南緯" : "北緯"} ${Math.abs(point.latitude).toFixed(5)}`;
  const lng = `${point.longitude < 0 ? "西経" : "東経"} ${Math.abs(point.longitude).toFixed(5)}`;
  return `${lat}、${lng}`;
}
