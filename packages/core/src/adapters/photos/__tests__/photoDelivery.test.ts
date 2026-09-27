import { describe, expect, it } from "vitest";
import type { PhotoBucket } from "../photoBucket";
import { servePhoto } from "../photoDelivery";
import { InMemoryPhotoBucket } from "../testing/inMemoryPhotoBucket";

/** A bucket that records every key it is asked for. */
function recordingBucket(): Readonly<{
  bucket: PhotoBucket;
  keys: string[];
}> {
  const inner = new InMemoryPhotoBucket();
  const keys: string[] = [];
  return {
    keys,
    bucket: {
      head: (key) => {
        keys.push(key);
        return inner.head(key);
      },
      get: (key) => {
        keys.push(key);
        return inner.get(key);
      },
      put: (key, value, options) => inner.put(key, value, options),
      delete: (key) => inner.delete(key),
    },
  };
}

const request = (path: string, init?: RequestInit) =>
  new Request(`http://lunt.test${path}`, init);

describe("servePhoto", () => {
  it("answers 404 without reading the bucket when the path is not a photo id", async () => {
    const { bucket, keys } = recordingBucket();
    for (const path of [
      "/photos/not-an-id",
      "/photos/..%2Fsecret",
      "/photos/%20",
      "/photos/ffffffff-ffff-4fff-8fff-000000000001",
      "/photos/ffffffff-ffff-7fff-8fff-00000000000",
    ]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await servePhoto(bucket, request(path, { method }));
        expect(response.status).toBe(404);
      }
    }
    expect(keys).toEqual([]);
  });

  it("reads the bucket for a well-formed id, and is 404 when it has no content", async () => {
    const { bucket, keys } = recordingBucket();
    const id = "ffffffff-ffff-7fff-8fff-000000000001";
    const response = await servePhoto(bucket, request(`/photos/${id}`));
    expect(response.status).toBe(404);
    expect(keys).toEqual([`photos/${id}`]);
  });
});
