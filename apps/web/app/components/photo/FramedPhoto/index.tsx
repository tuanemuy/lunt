"use client";

import { Photo } from "@/components/ui/Photo";
import type { Framing } from "@/presentation/listingView";

type FramedPhotoProps = {
  /** `null` draws the paper placeholder of a photo without content. */
  url: string | null;
  /** The part viewers see; `null` shows the whole photo. */
  framing: Framing | null;
  /** Empty for a decorative copy next to its name. */
  alt: string;
  /** The box's aspect (width / height), as `className` sizes it. */
  ratio: number;
  /** Sizes the box (aspect ratio, width, radius). */
  className: string;
};

/**
 * A registered photo cropped to its framing (CF-01 見せる範囲) the way
 * viewers see it — the viewer screens' `Photo` with the management
 * screens' photo URL.
 */
export function FramedPhoto({
  url,
  framing,
  alt,
  ratio,
  className,
}: FramedPhotoProps) {
  return (
    <Photo
      photo={url === null ? null : { src: url, framing }}
      alt={alt}
      ratio={ratio}
      className={className}
    />
  );
}
