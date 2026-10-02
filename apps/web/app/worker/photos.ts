import type { PhotoBucket } from "@repo/core/adapters/r2/photoBucket";
import {
  PHOTO_PATH_PREFIX,
  servePhoto,
} from "@repo/core/adapters/r2/photoDelivery";

export { PHOTO_PATH_PREFIX };

/**
 * The Worker route that serves photo content (design.md D-09):
 * `GET` / `HEAD /photos/{photoId}` from the `PHOTOS` R2 bucket, with the
 * stored content type, an `ETag` (`304` on a matching `If-None-Match`) and
 * a short `Cache-Control`; `404` when the photo has no content. The
 * `PhotoDisplayRef`s `R2PhotoStorage.displayRefs` returns point here.
 * Without the binding every photo is `404`.
 */
export function handlePhotoRequest(
  request: Request,
  bucket: PhotoBucket | undefined,
): Promise<Response> {
  if (bucket === undefined) {
    return Promise.resolve(
      new Response("Not Found", {
        status: 404,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
      }),
    );
  }
  return servePhoto(bucket, request);
}
