import type { Actor } from "@repo/core/domain/common/actor";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { PhotoId } from "@repo/core/domain/common/ids";
import type { PhotoItem, PhotoSet } from "@repo/core/domain/common/photoSet";
import type { PhotoOwnerRef } from "@repo/core/domain/common/refs";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import { PhotoOwnership } from "@repo/core/domain/media/photoOwnership";
import type { PhotoStorage } from "@repo/core/domain/media/ports/photoStorage";
import type { MediaRepositories } from "@repo/core/domain/media/ports/unitOfWork";

const chunks = <T>(items: readonly T[]): readonly (readonly T[])[] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += IdBatch.maxSize) {
    result.push(items.slice(i, i + IdBatch.maxSize));
  }
  return result;
};

/**
 * Makes `owner` the owner of the photos a save newly adds
 * (`PhotoOwnership.claimAll`), inside the unit of work that writes the
 * owner. `MEDIA_PHOTO_NOT_AVAILABLE` / `MEDIA_PHOTO_NOT_REGISTRANT` /
 * `MEDIA_PHOTO_ALREADY_OWNED` roll the whole unit of work back.
 */
export async function claimNewPhotos(
  ctx: MediaRepositories,
  photoIds: readonly PhotoId[],
  owner: PhotoOwnerRef,
  by: Actor,
): Promise<void> {
  if (photoIds.length === 0) return;
  const found = (
    await Promise.all(
      chunks(photoIds).map((ids) => ctx.photoAssetRepository.findByIds(ids)),
    )
  ).flat();
  const versions = new Map(
    found.map((read) => [read.entity.id, read.expectedVersion]),
  );
  const claimed = PhotoOwnership.claimAll(
    found.map((read) => read.entity),
    photoIds,
    owner,
    by,
  );
  for (const photo of claimed) {
    const expectedVersion = versions.get(photo.id);
    if (expectedVersion === undefined) {
      throw new Error(`Claimed photo ${photo.id} was not read`);
    }
    await ctx.photoAssetRepository.save(photo, expectedVersion);
  }
}

/** A photo with the reference screens fetch it by. */
export type PhotoView = Readonly<{
  photoId: PhotoId;
  displayRef: PhotoDisplayRef;
}>;

/** `PhotoStorage.displayRefs` for any number of ids, 100 per call. */
export async function displayRefsOf(
  storage: PhotoStorage,
  photoIds: readonly PhotoId[],
): Promise<ReadonlyMap<PhotoId, PhotoDisplayRef>> {
  const unique = [...new Set(photoIds)];
  const maps = await Promise.all(
    chunks(unique).map((ids) => storage.displayRefs(ids)),
  );
  return new Map(maps.flatMap((map) => [...map]));
}

export function photoView(
  refs: ReadonlyMap<PhotoId, PhotoDisplayRef>,
  photoId: PhotoId,
): PhotoView {
  const displayRef = refs.get(photoId);
  if (displayRef === undefined) {
    throw new Error(`No display ref for photo ${photoId}`);
  }
  return { photoId, displayRef };
}

/** The first photo of `photos` — the cover a row shows — or `null`. */
export const coverIdOf = (photos: PhotoSet<PhotoItem>): PhotoId | null =>
  photos.items[0]?.photoId ?? null;

/** `photoView` of a cover, `null` without one. */
export const coverView = (
  refs: ReadonlyMap<PhotoId, PhotoDisplayRef>,
  photoId: PhotoId | null,
): PhotoView | null => (photoId === null ? null : photoView(refs, photoId));
