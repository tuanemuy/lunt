"use client";

import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import {
  type NaturalSize,
  type PhotoSource,
  photoPlacement,
} from "@/presentation/photoFraming";
import { cx } from "../cx";

export type { PhotoSource } from "@/presentation/photoFraming";

type PhotoProps = {
  /** `null` draws the paper box of an object without a photo. */
  photo: PhotoSource | null;
  alt: string;
  /** The box's aspect (width / height), fixed by `className`'s CSS. */
  ratio: number;
  /** The design's box class (`hero__photo`, `card__photo`, `m-row__photo`…). */
  className: string;
  /** Text inside the empty box (e.g. 写真なし). */
  emptyLabel?: string;
  /** The first screenful's photo loads eagerly; the rest wait until near. */
  priority?: boolean;
};

function toStyle(
  photo: PhotoSource,
  natural: NaturalSize | null,
  ratio: number,
): CSSProperties | undefined {
  const placement = photoPlacement(photo.framing, natural, ratio);
  if (placement === null) return undefined;
  return {
    position: "absolute",
    maxWidth: "none",
    // With the natural size the box is exactly the image's shape; before
    // it, `cover` keeps the photo undistorted inside the framing's box.
    objectFit: natural === null ? "cover" : "fill",
    left: `${placement.left}%`,
    top: `${placement.top}%`,
    width: `${placement.width}%`,
    height: `${placement.height}%`,
  };
}

/**
 * A photo served by `/photos/{id}` inside its design box, showing only its
 * framing (display only; uploads live in `components/photo`). The box
 * keeps its size while the image loads, and a photo that fails to load
 * leaves the paper box.
 */
export function Photo({
  photo,
  alt,
  ratio,
  className,
  emptyLabel,
  priority = false,
}: PhotoProps) {
  const image = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<NaturalSize | null>(null);
  const [failed, setFailed] = useState(false);
  const src = photo?.src;

  // An image the server rendered may finish loading before hydration, so
  // its `load` event is gone; read the size it already has.
  useLayoutEffect(() => {
    setFailed(false);
    const element = image.current;
    if (src === undefined || element === null) {
      setNatural(null);
      return;
    }
    // Likewise a failure before hydration fired its `error` event unheard.
    if (element.complete && element.naturalWidth === 0) {
      setFailed(true);
      return;
    }
    setNatural(
      element.complete && element.naturalWidth > 0
        ? { width: element.naturalWidth, height: element.naturalHeight }
        : null,
    );
  }, [src]);

  if (photo === null || failed) {
    return (
      <div className={cx(className, "photo", "photo--empty")}>
        {emptyLabel === undefined ? null : (
          <span className="photo__empty">{emptyLabel}</span>
        )}
      </div>
    );
  }
  return (
    <div className={cx(className, "photo")}>
      <img
        ref={image}
        src={photo.src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        style={toStyle(photo, natural, ratio)}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          setNatural({ width: naturalWidth, height: naturalHeight });
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
