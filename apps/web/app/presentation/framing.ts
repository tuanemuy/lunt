import type { Framing } from "./listingView";

/** The framing editor's controls: zoom (1 = the whole photo) and the frame's centre. */
export type FramingControls = Readonly<{
  zoom: number;
  centerX: number;
  centerY: number;
}>;

export const FRAMING_MAX_ZOOM = 3;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

/** The frame the controls describe; zoom 1 shows the whole photo (`null`). */
export function framingOf(controls: FramingControls): Framing | null {
  const zoom = clamp(controls.zoom, 1, FRAMING_MAX_ZOOM);
  if (zoom <= 1) return null;
  const size = round(1 / zoom);
  return {
    x: round(clamp(controls.centerX - size / 2, 0, 1 - size)),
    y: round(clamp(controls.centerY - size / 2, 0, 1 - size)),
    width: size,
    height: size,
  };
}

/** The controls a stored framing starts the editor from. */
export function controlsOf(framing: Framing | null): FramingControls {
  if (framing === null) return { zoom: 1, centerX: 0.5, centerY: 0.5 };
  return {
    zoom: clamp(
      1 / Math.max(framing.width, framing.height),
      1,
      FRAMING_MAX_ZOOM,
    ),
    centerX: framing.x + framing.width / 2,
    centerY: framing.y + framing.height / 2,
  };
}
