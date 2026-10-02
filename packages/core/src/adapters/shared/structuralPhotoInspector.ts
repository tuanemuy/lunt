import { PhotoFormat } from "@repo/core/domain/media/photoFile";
import type { PhotoInspection } from "@repo/core/domain/media/photoInspection";
import type { PhotoInspector } from "@repo/core/domain/media/ports/photoInspector";
import { crc32 } from "./crc32";

/**
 * `PhotoInspector` that checks the container structure of JPEG, PNG and
 * WebP files in plain TypeScript (design.md D-09): every segment / chunk
 * must be well-formed and fit the file, the image header must be sane,
 * and the image data must be complete (JPEG's end-of-image marker, PNG's
 * `IEND` with per-chunk CRCs, WebP's RIFF size). It does not decode the
 * pixels. Animated images (APNG, animated WebP) and every other format —
 * GIF, HEIC, video, text — are `not_a_photo`: they are not still images a
 * browser shows everywhere. So is an image wider or taller than
 * `MAX_PHOTO_SIDE` pixels: a small file can declare a size whose decoding
 * would exhaust a viewer's memory.
 */
export class StructuralPhotoInspector implements PhotoInspector {
  async inspect(bytes: Uint8Array): Promise<PhotoInspection> {
    return inspectPhoto(bytes);
  }
}

const JPEG = PhotoFormat.create("image/jpeg");
const PNG = PhotoFormat.create("image/png");
const WEBP = PhotoFormat.create("image/webp");

const NOT_A_PHOTO: PhotoInspection = { kind: "not_a_photo" };

/** The largest width or height, in pixels, of a file read as a photo. */
export const MAX_PHOTO_SIDE = 16384;

const withinSide = (width: number, height: number): boolean =>
  width > 0 &&
  height > 0 &&
  width <= MAX_PHOTO_SIDE &&
  height <= MAX_PHOTO_SIDE;

/** The inspection of `bytes`; never throws. */
export function inspectPhoto(bytes: Uint8Array): PhotoInspection {
  if (isJpeg(bytes)) return { kind: "photo", format: JPEG };
  if (isPng(bytes)) return { kind: "photo", format: PNG };
  if (isWebp(bytes)) return { kind: "photo", format: WEBP };
  return NOT_A_PHOTO;
}

const at = (b: Uint8Array, i: number): number => b[i] ?? 0;
const u16be = (b: Uint8Array, i: number): number =>
  (at(b, i) << 8) | at(b, i + 1);
const u32be = (b: Uint8Array, i: number): number =>
  ((at(b, i) << 24) |
    (at(b, i + 1) << 16) |
    (at(b, i + 2) << 8) |
    at(b, i + 3)) >>>
  0;
const u16le = (b: Uint8Array, i: number): number =>
  at(b, i) | (at(b, i + 1) << 8);
const u24le = (b: Uint8Array, i: number): number =>
  at(b, i) | (at(b, i + 1) << 8) | (at(b, i + 2) << 16);
const u32le = (b: Uint8Array, i: number): number =>
  (at(b, i) |
    (at(b, i + 1) << 8) |
    (at(b, i + 2) << 16) |
    (at(b, i + 3) << 24)) >>>
  0;
const ascii = (b: Uint8Array, i: number, length: number): string =>
  String.fromCharCode(...b.subarray(i, i + length));

// Start-of-frame markers: C0–CF except DHT (C4), JPG (C8) and DAC (CC).
const isStartOfFrame = (marker: number): boolean =>
  marker >= 0xc0 &&
  marker <= 0xcf &&
  marker !== 0xc4 &&
  marker !== 0xc8 &&
  marker !== 0xcc;

const isRestart = (marker: number): boolean => marker >= 0xd0 && marker <= 0xd7;

function isJpeg(b: Uint8Array): boolean {
  if (b.length < 4 || at(b, 0) !== 0xff || at(b, 1) !== 0xd8) return false;
  let i = 2;
  let frame = false;
  let scan = false;
  while (i < b.length) {
    if (at(b, i) !== 0xff) return false;
    while (i < b.length && at(b, i) === 0xff) i++;
    if (i >= b.length) return false;
    const marker = at(b, i);
    i++;
    if (marker === 0xd9) return frame && scan;
    if (marker === 0x00 || marker === 0xd8) return false;
    if (isRestart(marker) || marker === 0x01) continue;
    if (i + 2 > b.length) return false;
    const length = u16be(b, i);
    if (length < 2 || i + length > b.length) return false;
    if (isStartOfFrame(marker)) {
      const components = at(b, i + 7);
      if (
        frame ||
        length < 8 ||
        !withinSide(u16be(b, i + 5), u16be(b, i + 3)) ||
        components < 1 ||
        components > 4 ||
        length !== 8 + 3 * components
      ) {
        return false;
      }
      frame = true;
    }
    i += length;
    if (marker === 0xda) {
      if (!frame) return false;
      scan = true;
      // Entropy-coded data runs to the next marker; FF00 is a stuffed byte
      // and FFD0–FFD7 are restart markers inside the scan.
      while (i < b.length) {
        if (at(b, i) !== 0xff) {
          i++;
          continue;
        }
        if (i + 1 >= b.length) return false;
        const next = at(b, i + 1);
        if (next === 0x00 || isRestart(next)) {
          i += 2;
          continue;
        }
        if (next === 0xff) {
          i++;
          continue;
        }
        break;
      }
    }
  }
  return false;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const PNG_BIT_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

function isPngHeader(b: Uint8Array, data: number, length: number): boolean {
  if (length !== 13) return false;
  const width = u32be(b, data);
  const height = u32be(b, data + 4);
  const bitDepth = at(b, data + 8);
  const colorType = at(b, data + 9);
  return (
    withinSide(width, height) &&
    (PNG_BIT_DEPTHS[colorType]?.includes(bitDepth) ?? false) &&
    at(b, data + 10) === 0 &&
    at(b, data + 11) === 0 &&
    at(b, data + 12) <= 1
  );
}

function isPng(b: Uint8Array): boolean {
  if (b.length < 8 || PNG_SIGNATURE.some((v, i) => at(b, i) !== v)) {
    return false;
  }
  let i = 8;
  let first = true;
  let imageData = false;
  while (i + 12 <= b.length) {
    const length = u32be(b, i);
    const end = i + 12 + length;
    if (length > 0x7fffffff || end > b.length) return false;
    const type = ascii(b, i + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) return false;
    if (crc32(b, i + 4, i + 8 + length) !== u32be(b, i + 8 + length)) {
      return false;
    }
    if (first) {
      if (type !== "IHDR" || !isPngHeader(b, i + 8, length)) return false;
      first = false;
    } else if (type === "IHDR" || type === "acTL") {
      return false;
    } else if (type === "IDAT") {
      imageData = true;
    } else if (type === "IEND") {
      return imageData && length === 0;
    }
    i = end;
  }
  return false;
}

function isWebp(b: Uint8Array): boolean {
  if (b.length < 20 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") {
    return false;
  }
  const riffEnd = 8 + u32le(b, 4);
  if (riffEnd > b.length || riffEnd < 20) return false;
  let i = 12;
  let first = true;
  let image = false;
  while (i + 8 <= riffEnd) {
    const fourcc = ascii(b, i, 4);
    const size = u32le(b, i + 4);
    const data = i + 8;
    if (data + size > riffEnd) return false;
    if (first) {
      if (fourcc !== "VP8 " && fourcc !== "VP8L" && fourcc !== "VP8X") {
        return false;
      }
      first = false;
    }
    switch (fourcc) {
      case "VP8X":
        if (
          size < 10 ||
          (at(b, data) & 0x02) !== 0 ||
          !withinSide(u24le(b, data + 4) + 1, u24le(b, data + 7) + 1)
        ) {
          return false;
        }
        break;
      case "ANIM":
      case "ANMF":
        return false;
      case "VP8 ":
        if (
          image ||
          size < 10 ||
          (at(b, data) & 0x01) !== 0 ||
          at(b, data + 3) !== 0x9d ||
          at(b, data + 4) !== 0x01 ||
          at(b, data + 5) !== 0x2a ||
          (u16le(b, data + 6) & 0x3fff) === 0 ||
          (u16le(b, data + 8) & 0x3fff) === 0
        ) {
          return false;
        }
        image = true;
        break;
      case "VP8L":
        if (
          image ||
          size < 5 ||
          at(b, data) !== 0x2f ||
          (at(b, data + 4) & 0xe0) !== 0
        ) {
          return false;
        }
        image = true;
        break;
    }
    i = data + size + (size % 2);
  }
  // The last chunk's pad byte may be left out of the RIFF size.
  return image && (i === riffEnd || i === riffEnd + 1);
}
