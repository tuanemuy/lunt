import { describe, expect, it } from "vitest";
import { crc32 } from "../crc32";
import { inspectPhoto, MAX_PHOTO_SIDE } from "../structuralPhotoInspector";
import {
  jpegDeclaring,
  pngDeclaring,
  sampleEncodedPng,
  sampleGif,
  sampleJpeg,
  sampleLosslessWebp,
  samplePng,
  sampleProgressiveJpeg,
  sampleWebp,
  webpDeclaring,
} from "../testing/photoSamples";

const u32 = (bytes: Uint8Array, offset: number, value: number) =>
  new DataView(bytes.buffer, bytes.byteOffset).setUint32(offset, value);

/** A copy of `png` with a chunk of `type` inserted after IHDR. */
function withChunkAfterHeader(png: Uint8Array, type: string): Uint8Array {
  const chunk = new Uint8Array(12 + 8);
  chunk.set(
    Uint8Array.from(type, (c) => c.charCodeAt(0)),
    4,
  );
  u32(chunk, 0, 8);
  u32(chunk, 16, crc32(chunk, 4, 16));
  const cut = 8 + 25;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, cut));
  out.set(chunk, cut);
  out.set(png.subarray(cut), cut + chunk.length);
  return out;
}

describe("StructuralPhotoInspector", () => {
  it.each([
    ["baseline JPEG", sampleJpeg(), "image/jpeg"],
    [
      "progressive JPEG with EXIF and ICC",
      sampleProgressiveJpeg(),
      "image/jpeg",
    ],
    ["PNG from libpng", sampleEncodedPng(), "image/png"],
    ["generated PNG", samplePng(42), "image/png"],
    ["lossy WebP", sampleWebp(), "image/webp"],
    ["lossless WebP", sampleLosslessWebp(), "image/webp"],
  ])("reads a %s as a photo", (_, bytes, format) => {
    expect(inspectPhoto(bytes)).toEqual({ kind: "photo", format });
  });

  it("refuses GIF, a format it does not accept", () => {
    expect(inspectPhoto(sampleGif())).toEqual({ kind: "not_a_photo" });
  });

  it("refuses an animated PNG", () => {
    expect(inspectPhoto(withChunkAfterHeader(samplePng(), "acTL"))).toEqual({
      kind: "not_a_photo",
    });
  });

  it("accepts an unknown ancillary PNG chunk with a valid CRC", () => {
    expect(inspectPhoto(withChunkAfterHeader(samplePng(), "tEXt")).kind).toBe(
      "photo",
    );
  });

  it("refuses a PNG with a corrupted byte", () => {
    const bytes = samplePng();
    bytes[40] = (bytes[40] ?? 0) ^ 0xff;
    expect(inspectPhoto(bytes)).toEqual({ kind: "not_a_photo" });
  });

  it("refuses every truncation of each sample", () => {
    for (const sample of [
      sampleJpeg(),
      sampleProgressiveJpeg(),
      samplePng(),
      sampleWebp(),
      sampleLosslessWebp(),
    ]) {
      for (let length = 0; length < sample.length; length++) {
        expect(inspectPhoto(sample.slice(0, length)).kind).toBe("not_a_photo");
      }
    }
  });

  describe.each([
    ["JPEG", jpegDeclaring, "image/jpeg"],
    ["PNG", pngDeclaring, "image/png"],
    ["extended WebP", webpDeclaring, "image/webp"],
  ])("a %s's declared size", (_, declaring, format) => {
    const max = MAX_PHOTO_SIDE;

    it("is a photo up to MAX_PHOTO_SIDE pixels a side", () => {
      expect(inspectPhoto(declaring(max, max))).toEqual({
        kind: "photo",
        format,
      });
      expect(inspectPhoto(declaring(3, 2))).toEqual({ kind: "photo", format });
    });

    it("is not a photo when wider or taller than MAX_PHOTO_SIDE", () => {
      for (const [width, height] of [
        [max + 1, 2],
        [2, max + 1],
      ] as const) {
        expect(inspectPhoto(declaring(width, height))).toEqual({
          kind: "not_a_photo",
        });
      }
    });
  });
});
