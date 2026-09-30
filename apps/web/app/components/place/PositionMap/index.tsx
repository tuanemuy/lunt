"use client";

import { useMemo } from "react";
import { MapCanvas } from "@/components/map/MapCanvas";
import type { LngLat, MapPin, MapViewport } from "@/components/map/types";
import { useMapStyleUrl } from "@/components/map/useMapStyleUrl";
import { POINT_ZOOM, positionText } from "../PositionField/position";

type PositionMapProps = {
  point: LngLat;
  /** Whose point, in the map's accessible name: 位置 / 開催場所の位置. */
  name: string;
  /** The pin's short text (店, 地, 催). */
  mark: string;
  /** Sizes the box (the design's `.m-map` height). */
  className: string;
  /** The map could not be drawn; the caller offers the coordinates. */
  onUnavailable?: () => void;
};

const NO_PINS: readonly MapPin[] = [];

/**
 * One chosen point on a small still map (the design's `.m-map` + `.m-pin`):
 * no pan, zoom or pins to choose. Shown by CF-09's field and by the
 * application screens that show a position; the caller keeps the
 * coordinates as text beside it, since the map may fail to draw.
 */
export function PositionMap({
  point,
  name,
  mark,
  className,
  onUnavailable,
}: PositionMapProps) {
  const styleUrl = useMapStyleUrl();
  const viewport = useMemo<MapViewport>(
    () => ({ kind: "center", center: point, zoom: POINT_ZOOM }),
    [point],
  );
  if (styleUrl === null) {
    return (
      <div className={`map ${className}`} role="status">
        <span className="skeleton map__skeleton" aria-hidden="true" />
        <span className="sr-only">地図を読み込んでいます</span>
      </div>
    );
  }
  return (
    <MapCanvas
      className={className}
      styleUrl={styleUrl}
      label={`${name}の地図（${positionText(point)}）`}
      viewport={viewport}
      pins={NO_PINS}
      picked={{
        position: point,
        label: `${name}: ${positionText(point)}`,
        mark,
      }}
      interactive={false}
      {...(onUnavailable === undefined ? {} : { onUnavailable })}
    />
  );
}
