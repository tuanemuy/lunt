import {
  CommonErrorCode,
  SubjectErrorCode,
} from "@repo/core/domain/common/errorCode";
import type { ExposureSubject } from "@repo/core/domain/common/exposureSubject";
import type { PhotoId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";

declare const photoSetBrand: unique symbol;

export type PhotoItem = Readonly<{ photoId: PhotoId }>;

/**
 * Ordered photos (the first is the cover) with no repeated `PhotoId`, plus
 * whether a takedown claim removed photos since the last deliberate change.
 * Branded so every write goes through `of` / `replace` / `takeDown`.
 */
export type PhotoSet<P extends PhotoItem> = Readonly<{
  items: readonly P[];
  takenDown: boolean;
}> & { readonly [photoSetBrand]: true };

const hasDuplicate = (items: readonly PhotoItem[]): boolean =>
  new Set(items.map((item) => item.photoId)).size !== items.length;

const sameOrder = (a: readonly PhotoItem[], b: readonly PhotoItem[]): boolean =>
  a.length === b.length && a.every((item, i) => item.photoId === b[i]?.photoId);

const build = <P extends PhotoItem>(
  items: readonly P[],
  takenDown: boolean,
): PhotoSet<P> => ({ items, takenDown }) as PhotoSet<P>;

const assertNoDuplicate = <S extends ExposureSubject>(
  items: readonly PhotoItem[],
  subject: S,
): void => {
  if (hasDuplicate(items)) {
    throw new BusinessRuleError(
      SubjectErrorCode.duplicatePhoto(subject),
      "The same photo appears more than once",
    );
  }
};

export const PhotoSet = {
  /** New set with `takenDown: false`. Throws `{subject}_DUPLICATE_PHOTO` on a repeated `PhotoId`. */
  of: <P extends PhotoItem, S extends ExposureSubject>(
    items: readonly P[],
    subject: S,
  ): PhotoSet<P> => {
    assertNoDuplicate(items, subject);
    return build(items, false);
  },

  /**
   * Rebuilds a stored set, `takenDown` included. For adapters rehydrating an
   * aggregate; fresh input goes through `of`.
   */
  reconstruct: <P extends PhotoItem, S extends ExposureSubject>(
    items: readonly P[],
    takenDown: boolean,
    subject: S,
  ): PhotoSet<P> => {
    assertNoDuplicate(items, subject);
    return build(items, takenDown);
  },

  /**
   * Replaces the items. `takenDown` survives only when the `PhotoId` sequence
   * is unchanged — a deliberate change of photos clears the takedown marker.
   * `items` normally come from `PhotoSet.of(…).items` or
   * `RevisedPhotos.overlay`, both duplicate-free; a repeated `PhotoId` here is
   * a caller bug and is rejected as `COMMON_INVALID_INPUT`.
   */
  replace: <P extends PhotoItem>(
    current: PhotoSet<P>,
    items: readonly P[],
  ): PhotoSet<P> => {
    if (hasDuplicate(items)) {
      throw new BusinessRuleError(
        CommonErrorCode.InvalidInput,
        "The same photo appears more than once",
      );
    }
    return build(
      items,
      sameOrder(current.items, items) ? current.takenDown : false,
    );
  },

  /**
   * Removes every photo in `photoIds` and sets `takenDown`, keeping the order
   * of the rest. If any id is not in the set, nothing is removed and
   * `{subject}_PHOTO_NOT_FOUND` is thrown.
   */
  takeDown: <P extends PhotoItem, S extends ExposureSubject>(
    photos: PhotoSet<P>,
    photoIds: readonly [PhotoId, ...PhotoId[]],
    subject: S,
  ): PhotoSet<P> => {
    const present = new Set(photos.items.map((item) => item.photoId));
    if (!photoIds.every((id) => present.has(id))) {
      throw new BusinessRuleError(
        SubjectErrorCode.photoNotFound(subject),
        "Photo not found",
      );
    }
    const removed = new Set<PhotoId>(photoIds);
    return build(
      photos.items.filter((item) => !removed.has(item.photoId)),
      true,
    );
  },

  photoIds: <P extends PhotoItem>(photos: PhotoSet<P>): readonly PhotoId[] =>
    photos.items.map((item) => item.photoId),

  /** `PhotoId`s in `before` that are absent from `after` — what a save releases. */
  removedPhotoIds: <P extends PhotoItem>(
    before: PhotoSet<P>,
    after: PhotoSet<P>,
  ): readonly PhotoId[] => {
    const kept = new Set(after.items.map((item) => item.photoId));
    return before.items
      .map((item) => item.photoId)
      .filter((id) => !kept.has(id));
  },

  isEmpty: <P extends PhotoItem>(photos: PhotoSet<P>): boolean =>
    photos.items.length === 0,
};
