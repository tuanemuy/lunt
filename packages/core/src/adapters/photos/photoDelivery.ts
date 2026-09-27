import {
  type IdGenerator,
  UuidV7Generator,
} from "@repo/core/application/ports/idGenerator";
import type { PhotoId } from "@repo/core/domain/common/ids";
import {
  type PhotoBucket,
  type PhotoObject,
  photoObjectKey,
} from "./photoBucket";

/** Path prefix of the Worker route that serves photo content. */
export const PHOTO_PATH_PREFIX = "/photos/";

/** Same-origin path of a photo's content: what a `PhotoDisplayRef` holds. */
export const photoPath = (photoId: PhotoId): string =>
  `${PHOTO_PATH_PREFIX}${encodeURIComponent(photoId)}`;

// Short, because a photo's content may be replaced or deleted (a takedown
// must stop showing soon); the ETag makes revalidation cheap.
const CACHE_CONTROL = "public, max-age=60, must-revalidate";

const notFound = (): Response =>
  new Response("Not Found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
  });

/**
 * The photo id a request path names, or `null` when it names none: the
 * segment must be an id the generator could have minted, so a malformed
 * path never reaches the bucket.
 */
function photoIdOf(
  pathname: string,
  ids: Pick<IdGenerator, "parse">,
): string | null {
  if (!pathname.startsWith(PHOTO_PATH_PREFIX)) return null;
  const segment = pathname.slice(PHOTO_PATH_PREFIX.length);
  if (segment === "" || segment.includes("/")) return null;
  try {
    return ids.parse(decodeURIComponent(segment));
  } catch {
    return null;
  }
}

const opaque = (tag: string): string => tag.trim().replace(/^W\//, "");

/** `If-None-Match` (weak comparison, RFC 9110 §13.1.2) against `etag`. */
function matches(ifNoneMatch: string, etag: string): boolean {
  if (ifNoneMatch.trim() === "*") return true;
  return ifNoneMatch.split(",").some((tag) => opaque(tag) === opaque(etag));
}

/**
 * Serves `GET` / `HEAD /photos/{photoId}` from `bucket` (design.md D-09):
 * the stored content type, an `ETag`, a short `Cache-Control`, `304` for a
 * matching `If-None-Match`, `404` when there is no content or the path
 * does not name an id `ids` accepts (answered without reading the
 * bucket), `405` for other methods.
 */
export async function servePhoto(
  bucket: PhotoBucket,
  request: Request,
  ids: Pick<IdGenerator, "parse"> = UuidV7Generator,
): Promise<Response> {
  const photoId = photoIdOf(new URL(request.url).pathname, ids);
  if (photoId === null) return notFound();
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD", "Content-Type": "text/plain" },
    });
  }
  const key = photoObjectKey(photoId);
  const ifNoneMatch = request.headers.get("If-None-Match");
  const head =
    request.method === "HEAD" || ifNoneMatch !== null
      ? await bucket.head(key)
      : null;
  if (
    head !== null &&
    ifNoneMatch !== null &&
    matches(ifNoneMatch, head.httpEtag)
  ) {
    return new Response(null, {
      status: 304,
      headers: { ETag: head.httpEtag, "Cache-Control": CACHE_CONTROL },
    });
  }
  const headers = (object: PhotoObject) => ({
    "Content-Type":
      object.httpMetadata?.contentType ?? "application/octet-stream",
    "Content-Length": String(object.size),
    ETag: object.httpEtag,
    "Cache-Control": CACHE_CONTROL,
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    return head === null
      ? notFound()
      : new Response(null, { status: 200, headers: headers(head) });
  }
  const object = await bucket.get(key);
  if (object === null) return notFound();
  return new Response(object.body, { status: 200, headers: headers(object) });
}
