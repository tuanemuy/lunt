import type { PhotoId } from "@repo/core/domain/common/ids";
import type { PhotoDisplayRef } from "../photoDisplayRef";
import type { PhotoFile } from "../photoFile";

/**
 * Where photo content lives (`spec/domains/media.md` 「PhotoStorage」).
 * Outside every unit of work: its writes are not rolled back. Every
 * operation gives the same result when repeated with the same arguments;
 * nothing is retried — the caller may resend. Content is keyed by
 * `PhotoId` only.
 *
 * - `put`: stores `file` as `photoId`'s content, replacing any.
 * - `copy`: `destinationId`'s content becomes a copy of `sourceId`'s,
 *   replacing any; the two are independent afterwards. `NotFoundError`
 *   when `sourceId` has no content.
 * - `delete`: removes the content; succeeds when there is none.
 * - `displayRefs`: a ref for each of 0–100 ids (`COMMON_INVALID_INPUT`
 *   above) without checking the content exists. A ref shows the id's
 *   current content while there is one.
 */
export interface PhotoStorage {
  put(photoId: PhotoId, file: PhotoFile): Promise<void>;
  copy(sourceId: PhotoId, destinationId: PhotoId): Promise<void>;
  delete(photoId: PhotoId): Promise<void>;
  displayRefs(
    photoIds: readonly PhotoId[],
  ): Promise<ReadonlyMap<PhotoId, PhotoDisplayRef>>;
}
