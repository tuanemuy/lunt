import {
  ApplicationError,
  NotFoundError,
  SystemError,
  SystemErrorCode,
} from "@repo/core/application/errors";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { PhotoId } from "@repo/core/domain/common/ids";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import type { PhotoFile } from "@repo/core/domain/media/photoFile";
import type { PhotoStorage } from "@repo/core/domain/media/ports/photoStorage";
import { type PhotoBucket, photoObjectKey } from "./photoBucket";
import { photoPath } from "./photoDelivery";

/** Code of the `NotFoundError` a `copy` without source content raises. */
export const PHOTO_CONTENT_NOT_FOUND = "PHOTO_CONTENT_NOT_FOUND";

async function external<T>(message: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new SystemError(SystemErrorCode.ExternalApiError, message, error);
  }
}

/**
 * `PhotoStorage` over an R2 bucket (the `PHOTOS` binding; design.md D-09).
 * Content lives at `photos/{photoId}` with its format as the object's
 * content type; a display ref is the same-origin path the Worker serves
 * it from (`servePhoto`). Bucket failures become retryable
 * `SystemError(EXTERNAL_API_ERROR)`.
 */
export class R2PhotoStorage implements PhotoStorage {
  constructor(private readonly bucket: PhotoBucket) {}

  put(photoId: PhotoId, file: PhotoFile): Promise<void> {
    return external(`Failed to store photo ${photoId}`, async () => {
      await this.bucket.put(photoObjectKey(photoId), file.bytes, {
        httpMetadata: { contentType: file.format },
      });
    });
  }

  copy(sourceId: PhotoId, destinationId: PhotoId): Promise<void> {
    return external(`Failed to copy photo ${sourceId}`, async () => {
      const source = await this.bucket.get(photoObjectKey(sourceId));
      if (source === null) {
        throw new NotFoundError(
          PHOTO_CONTENT_NOT_FOUND,
          `Photo ${sourceId} has no content`,
        );
      }
      await this.bucket.put(
        photoObjectKey(destinationId),
        await source.arrayBuffer(),
        {
          httpMetadata: {
            contentType:
              source.httpMetadata?.contentType ?? "application/octet-stream",
          },
        },
      );
    });
  }

  delete(photoId: PhotoId): Promise<void> {
    return external(`Failed to delete photo ${photoId}`, () =>
      this.bucket.delete(photoObjectKey(photoId)),
    );
  }

  async displayRefs(
    photoIds: readonly PhotoId[],
  ): Promise<ReadonlyMap<PhotoId, PhotoDisplayRef>> {
    IdBatch.assertWithinLimit(photoIds);
    return new Map(photoIds.map((id) => [id, { url: photoPath(id) }]));
  }
}
