import type { PhotoId } from "@repo/core/domain/common/ids";
import {
  type AcceptedPhoto,
  PhotoAsset,
  type StoredPhoto,
} from "@repo/core/domain/media/photoAsset";
import type { RequestContainer } from "../di/types";

export type PhotoDeletion = "deleted" | "gone" | "kept";

/**
 * Discards one photo and deletes its content, then its record
 * (`spec/domains/media.md` 「トランザクション境界」 破棄と削除): the
 * discard in one unit of work, the content, the record in another. A
 * photo with no record is `gone`; a `discarded` one continues from the
 * content. An `accepted` / `stored` photo is discarded only when
 * `shouldDiscard` says so on the photo as read here — otherwise `kept`.
 *
 * The discard is optimistically locked: a concurrent claim committed
 * first makes it a `ConflictError`, and the content stays. A failure after
 * the discard leaves the photo `discarded` for a later call to finish.
 */
export async function discardAndDeletePhoto(
  container: RequestContainer,
  id: PhotoId,
  shouldDiscard: (photo: AcceptedPhoto | StoredPhoto) => boolean,
): Promise<PhotoDeletion> {
  const discarded = await container.unitOfWorkProvider.run(
    async ({ photoAssetRepository }): Promise<PhotoDeletion | null> => {
      const found = await photoAssetRepository.findById(id);
      if (found === null) return "gone";
      const photo = found.entity;
      if (photo.stage === "discarded") return null;
      if (!shouldDiscard(photo)) return "kept";
      await photoAssetRepository.save(
        PhotoAsset.discard(photo),
        found.expectedVersion,
      );
      return null;
    },
  );
  if (discarded !== null) return discarded;

  await container.photoStorage.delete(id);

  await container.unitOfWorkProvider.run(async ({ photoAssetRepository }) => {
    const found = await photoAssetRepository.findById(id);
    if (found === null || found.entity.stage !== "discarded") return;
    await photoAssetRepository.delete(id, found.expectedVersion);
  });
  return "deleted";
}
