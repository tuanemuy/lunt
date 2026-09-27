import type { PhotoId } from "@repo/core/domain/common/ids";
import type { RequestContainer } from "../di/types";
import { defineConsumer } from "../events/consumer";
import { discardAndDeletePhoto } from "./photoDeletion";

/**
 * Deletes each of `photoIds`: discards it, deletes its content, then its
 * record — one photo at a time, one photo's failure not stopping the
 * others. Idempotent: a photo with no record counts as deleted, a
 * `discarded` one continues from its content.
 *
 * Throws, after trying every photo, when any did not reach deletion — an
 * `AggregateError` of the failures — so the event is redelivered and the
 * redelivery finishes the rest.
 */
export async function discardReleased(
  container: RequestContainer,
  photoIds: readonly PhotoId[],
): Promise<void> {
  const failures: unknown[] = [];
  for (const id of new Set(photoIds)) {
    try {
      await discardAndDeletePhoto(container, id, () => true);
    } catch (error) {
      container.logger.warn(`[media] released photo ${id} was not deleted`, {
        photoId: id,
        cause: error,
      });
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `${failures.length} released photo(s) were not deleted`,
    );
  }
}

/**
 * The `discardReleasedPhotos` consumer of `photos.released`
 * (`spec/usecases/media.md` 「discardReleasedPhotos」; LST-02, LST-06,
 * MOD-02 and others): deletes the photos an owner let go of. Deleted
 * photos never come back. No domain event.
 */
export const discardReleasedPhotos = defineConsumer(
  ["photos.released"],
  (container, event) => discardReleased(container, event.payload.photoIds),
);
