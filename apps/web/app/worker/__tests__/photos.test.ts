import { R2PhotoStorage } from "@repo/core/adapters/photos/r2PhotoStorage";
import { inspectPhoto } from "@repo/core/adapters/photos/structuralPhotoInspector";
import { InMemoryPhotoBucket } from "@repo/core/adapters/photos/testing/inMemoryPhotoBucket";
import { samplePng } from "@repo/core/adapters/photos/testing/photoSamples";
import { PhotoId } from "@repo/core/domain/common/ids";
import { PhotoIntake } from "@repo/core/domain/media/photoIntake";
import { describe, expect, it } from "vitest";
import { handlePhotoRequest } from "../photos";

const ORIGIN = "http://lunt.test";
const id = PhotoId.create("ffffffff-ffff-7fff-8fff-000000000001");

async function stored() {
  const bucket = new InMemoryPhotoBucket();
  const bytes = samplePng(3);
  await new R2PhotoStorage(bucket).put(
    id,
    PhotoIntake.accept(bytes, inspectPhoto(bytes)),
  );
  return { bucket, bytes };
}

const request = (path: string, init?: RequestInit) =>
  new Request(`${ORIGIN}${path}`, init);

describe("handlePhotoRequest", () => {
  it("serves the content with its type, an ETag and a short Cache-Control", async () => {
    const { bucket, bytes } = await stored();
    const response = await handlePhotoRequest(request(`/photos/${id}`), bucket);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("ETag")).toMatch(/^".+"$/);
    expect(response.headers.get("Cache-Control")).toContain("max-age=60");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("answers a matching If-None-Match with 304 and no body", async () => {
    const { bucket } = await stored();
    const first = await handlePhotoRequest(request(`/photos/${id}`), bucket);
    const etag = first.headers.get("ETag") ?? "";
    for (const header of [etag, `W/${etag}`, `"other", ${etag}`, "*"]) {
      const again = await handlePhotoRequest(
        request(`/photos/${id}`, { headers: { "If-None-Match": header } }),
        bucket,
      );
      expect(again.status).toBe(304);
      expect(again.headers.get("ETag")).toBe(etag);
      expect(await again.text()).toBe("");
    }
  });

  it("serves the content again when If-None-Match does not match", async () => {
    const { bucket } = await stored();
    const response = await handlePhotoRequest(
      request(`/photos/${id}`, { headers: { "If-None-Match": '"stale"' } }),
      bucket,
    );
    expect(response.status).toBe(200);
  });

  it("answers HEAD with the headers only", async () => {
    const { bucket, bytes } = await stored();
    const response = await handlePhotoRequest(
      request(`/photos/${id}`, { method: "HEAD" }),
      bucket,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe(String(bytes.length));
    expect(await response.text()).toBe("");
  });

  it("is 404 for a photo without content, a malformed path, or no bucket", async () => {
    const { bucket } = await stored();
    for (const path of [
      "/photos/ffffffff-ffff-7fff-8fff-000000000002",
      "/photos/",
      `/photos/${id}/extra`,
      "/photos/%E0%A4%A",
    ]) {
      expect((await handlePhotoRequest(request(path), bucket)).status).toBe(
        404,
      );
    }
    expect(
      (await handlePhotoRequest(request(`/photos/${id}`), undefined)).status,
    ).toBe(404);
  });

  it("refuses other methods with 405", async () => {
    const { bucket } = await stored();
    const response = await handlePhotoRequest(
      request(`/photos/${id}`, { method: "DELETE" }),
      bucket,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
  });
});
