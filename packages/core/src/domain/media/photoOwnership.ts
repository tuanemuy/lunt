import type { Actor } from "@repo/core/domain/common/actor";
import type { PhotoId } from "@repo/core/domain/common/ids";
import type { ContentRef, PhotoOwnerRef } from "@repo/core/domain/common/refs";
import { BusinessRuleError } from "@repo/core/domain/error";
import { MediaErrorCode } from "./errorCode";
import {
  type ApplicationOwnerRef,
  PhotoAsset,
  type StoredPhoto,
} from "./photoAsset";

function pick(
  photos: readonly PhotoAsset[],
  photoIds: readonly PhotoId[],
): readonly PhotoAsset[] {
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  return [...new Set(photoIds)].map((id) => {
    const photo = byId.get(id);
    if (photo === undefined) {
      throw new BusinessRuleError(
        MediaErrorCode.PhotoNotAvailable,
        `Photo ${id} is not available`,
      );
    }
    return photo;
  });
}

/**
 * Setting and moving photo owners, for other domains' usecases to call in
 * the unit of work that writes the aggregate or application holding the
 * photos (`spec/domains/media.md` 「PhotoOwnership」). All or nothing: one
 * photo failing fails the whole call. Pure — the usecase reads `photos`
 * with `PhotoAssetRepository.findByIds` and saves every returned photo.
 * A `PhotoId` repeated in `photoIds` is handled once.
 */
export const PhotoOwnership = {
  /**
   * Claims each of `photoIds` for `owner` (`PhotoAsset.claim`). Pass only
   * the photos this save or submission newly adds.
   * `MEDIA_PHOTO_NOT_AVAILABLE` when one is missing from `photos` (never
   * registered or already deleted).
   */
  claimAll: (
    photos: readonly PhotoAsset[],
    photoIds: readonly PhotoId[],
    owner: PhotoOwnerRef,
    by: Actor,
  ): readonly StoredPhoto[] =>
    pick(photos, photoIds).map((photo) => PhotoAsset.claim(photo, owner, by)),

  /**
   * Moves each of `photoIds` from the approved application `from` to `to`
   * (`PhotoAsset.transfer`) — every photo the application owns.
   * `MEDIA_PHOTO_NOT_AVAILABLE` when one is missing from `photos`.
   */
  transferAll: (
    photos: readonly PhotoAsset[],
    photoIds: readonly PhotoId[],
    from: ApplicationOwnerRef,
    to: ContentRef,
  ): readonly StoredPhoto[] =>
    pick(photos, photoIds).map((photo) => PhotoAsset.transfer(photo, from, to)),
};
