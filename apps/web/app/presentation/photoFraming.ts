/** The part of a photo viewers see, as fractions (0–1) of its width and height. */
export type FramingRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

/** A registered photo as a screen shows it: its display URL and framing. */
export type PhotoSource = Readonly<{
  src: string;
  /** The part viewers see (listing photos); `null` shows the whole photo. */
  framing: FramingRect | null;
}>;

export type NaturalSize = Readonly<{ width: number; height: number }>;

/**
 * Where the `<img>` sits inside its box, in percentages of the box: the
 * image is drawn at `width` × `height` and offset by `left`, `top`.
 */
export type PhotoPlacement = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * How to draw a photo in a box of aspect `boxRatio` (width / height) so the
 * box shows its `framing` (`null`: the whole photo, cropped to cover).
 *
 * With the photo's natural size, the framing is widened around its centre
 * to the box's aspect, scaled down if that no longer fits the photo, and
 * kept inside the photo — no distortion. Before the size is known (the
 * server render), the framing is mapped onto the box as it is; `null`
 * means plain `object-fit: cover` needs no placement.
 */
export function photoPlacement(
  framing: FramingRect | null,
  natural: NaturalSize | null,
  boxRatio: number,
): PhotoPlacement | null {
  if (natural === null || natural.width <= 0 || natural.height <= 0) {
    if (framing === null) return null;
    return {
      width: 100 / framing.width,
      height: 100 / framing.height,
      left: (-framing.x / framing.width) * 100,
      top: (-framing.y / framing.height) * 100,
    };
  }
  const { width: W, height: H } = natural;
  const rect = framing ?? { x: 0, y: 0, width: 1, height: 1 };
  const cx = (rect.x + rect.width / 2) * W;
  const cy = (rect.y + rect.height / 2) * H;
  let rw = rect.width * W;
  let rh = rect.height * H;
  if (rw / rh < boxRatio) rw = rh * boxRatio;
  else rh = rw / boxRatio;
  const scale = Math.min(1, W / rw, H / rh);
  rw *= scale;
  rh *= scale;
  const left = clamp(cx - rw / 2, 0, W - rw);
  const top = clamp(cy - rh / 2, 0, H - rh);
  return {
    width: (W / rw) * 100,
    height: (H / rh) * 100,
    left: (-left / rw) * 100,
    top: (-top / rh) * 100,
  };
}
