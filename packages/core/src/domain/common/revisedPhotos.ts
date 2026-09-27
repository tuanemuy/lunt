import type { PhotoId } from "@repo/core/domain/common/ids";
import { type PhotoItem, PhotoSet } from "@repo/core/domain/common/photoSet";

export type PhotoOrigin = "current" | "added";

export type RevisedPhoto<P extends PhotoItem> = P &
  Readonly<{ origin: PhotoOrigin }>;

/**
 * The photo field of a revision application: the desired order, each photo
 * tagged with whether the target had it at submission (`current`) or the
 * revision brings it (`added`). No repeated `PhotoId`.
 */
export type RevisedPhotos<P extends PhotoItem> = readonly RevisedPhoto<P>[];

const stripOrigin = <P extends PhotoItem>(photo: RevisedPhoto<P>): P => {
  const { origin: _origin, ...rest } = photo;
  return rest as unknown as P;
};

export const RevisedPhotos = {
  /** `desired` in order; photos also in `current` are `current`, the rest `added`. */
  between: <P extends PhotoItem>(
    current: PhotoSet<P>,
    desired: PhotoSet<P>,
  ): RevisedPhotos<P> => {
    const existing = new Set(current.items.map((item) => item.photoId));
    return desired.items.map(
      (item): RevisedPhoto<P> => ({
        ...item,
        origin: existing.has(item.photoId) ? "current" : "added",
      }),
    );
  },

  /**
   * Applies `revised` onto the target's present photos: `current`-origin
   * photos the target no longer has are dropped (a photo removed after
   * submission does not come back), then the result goes through
   * `PhotoSet.replace`.
   */
  overlay: <P extends PhotoItem>(
    current: PhotoSet<P>,
    revised: RevisedPhotos<P>,
  ): PhotoSet<P> => {
    const present = new Set(current.items.map((item) => item.photoId));
    const items = revised
      .filter((photo) => photo.origin === "added" || present.has(photo.photoId))
      .map(stripOrigin);
    return PhotoSet.replace(current, items);
  },

  /** The only photos a revision application owns. */
  addedPhotoIds: <P extends PhotoItem>(
    revised: RevisedPhotos<P>,
  ): readonly PhotoId[] =>
    revised
      .filter((photo) => photo.origin === "added")
      .map((photo) => photo.photoId),
};
