import { crc32 } from "../crc32";

const fromBase64 = (base64: string): Uint8Array =>
  Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

const ascii = (text: string): Uint8Array =>
  Uint8Array.from(text, (c) => c.charCodeAt(0));

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const u32be = (value: number): Uint8Array =>
  Uint8Array.of(
    value >>> 24,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typed = concat(ascii(type), data);
  return concat(u32be(data.length), typed, u32be(crc32(typed)));
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** A zlib stream of `raw` in one stored (uncompressed) deflate block. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const length = raw.length;
  return concat(
    Uint8Array.of(
      0x78,
      0x01,
      0x01,
      length & 0xff,
      length >>> 8,
      ~length & 0xff,
      (~length >>> 8) & 0xff,
    ),
    raw,
    u32be(adler32(raw)),
  );
}

/**
 * A valid 2×2 RGB PNG whose pixels derive from `seed`: distinct seeds give
 * distinct files (and digests), the same seed the same bytes.
 */
export function samplePng(seed = 0): Uint8Array {
  return pngDeclaring(2, 2, seed);
}

/**
 * `samplePng`'s 2×2 pixel data under a header declaring `width`×`height`:
 * structurally valid, for the inspector's size ceiling (it does not decode).
 */
export function pngDeclaring(
  width: number,
  height: number,
  seed = 0,
): Uint8Array {
  const header = concat(
    u32be(width),
    u32be(height),
    Uint8Array.of(8, 2, 0, 0, 0),
  );
  const rows: Uint8Array[] = [];
  for (let y = 0; y < 2; y++) {
    const row = [0];
    for (let x = 0; x < 2; x++) {
      const n = seed * 7 + y * 2 + x;
      row.push(n & 0xff, (n >>> 8) & 0xff, (seed >>> 16) & 0xff);
    }
    rows.push(Uint8Array.from(row));
  }
  return concat(
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlibStored(concat(...rows))),
    pngChunk("IEND", new Uint8Array()),
  );
}

/**
 * `samplePng(seed)` grown to exactly `length` bytes by an ancillary chunk
 * after the header: still a valid PNG.
 */
export function pngOfLength(length: number, seed = 0): Uint8Array {
  const png = samplePng(seed);
  const padding = length - png.length - 12;
  if (padding < 0)
    throw new Error(`A PNG needs at least ${png.length + 12} bytes`);
  const cut = 8 + 25;
  return concat(
    png.subarray(0, cut),
    pngChunk("teXt", new Uint8Array(padding)),
    png.subarray(cut),
  );
}

/** Baseline 3×2 JPEG (libjpeg via sharp). */
export const sampleJpeg = (): Uint8Array =>
  fromBase64(
    "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCQAIqQ/9k=",
  );

/** Progressive 3×2 JPEG with EXIF and an ICC profile (libjpeg via sharp). */
export const sampleProgressiveJpeg = (): Uint8Array =>
  fromBase64(
    "/9j/4QC8RXhpZgAASUkqAAgAAAAGABIBAwABAAAAAQAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAAA4YwAA6AMAADhjAADoAwAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAAMAAAADoAQAAQAAAAIAAAAAAAAA/+IB8ElDQ19QUk9GSUxFAAEBAAAB4GxjbXMEIAAAbW50clJHQiBYWVogB+IAAwAUAAkADgAdYWNzcE1TRlQAAAAAc2F3c2N0cmwAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1oYW5keem/Vlo+AbaDI4VVRvdPqgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKZGVzYwAAAPwAAAAkY3BydAAAASAAAAAid3RwdAAAAUQAAAAUY2hhZAAAAVgAAAAsclhZWgAAAYQAAAAUZ1hZWgAAAZgAAAAUYlhZWgAAAawAAAAUclRSQwAAAcAAAAAgZ1RSQwAAAcAAAAAgYlRSQwAAAcAAAAAgbWx1YwAAAAAAAAABAAAADGVuVVMAAAAIAAAAHABzAFIARwBCbWx1YwAAAAAAAAABAAAADGVuVVMAAAAGAAAAHABDAEMAMAAAWFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDD8AAAXd///zJgAAB5AAAP2S///7of///aIAAAPcAADAcVhZWiAAAAAAAABvoAAAOPIAAAOPWFlaIAAAAAAAAGKWAAC3iQAAGNpYWVogAAAAAAAAJKAAAA+FAAC2xHBhcmEAAAAAAAMAAAACZmkAAPKnAAANWQAAE9AAAApb/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoUDg8MEBcUGBgXFBYWGh0lHxobIxwWFiAsICMmJykqKRkfLTAtKDAlKCko/9sAQwEHBwcKCAoTCgoTKBoWGigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo/8IAEQgAAgADAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAE/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/2gAMAwEAAhADEAAAAYwRSf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQ8//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Qf//Z",
  );

/** 3×2 PNG (libpng via sharp). */
export const sampleEncodedPng = (): Uint8Array =>
  fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWM4EaABQQxwFgBO1AeBomWN1gAAAABJRU5ErkJggg==",
  );

/** Lossy 3×2 WebP (libwebp via sharp). */
export const sampleWebp = (): Uint8Array =>
  fromBase64(
    "UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoDAAIAAUAmJaACdLoB+AADsAD+6Di/+YJX5Bu1D/7B384D84D+igAA",
  );

/** Lossless 3×2 WebP (libwebp via sharp). */
export const sampleLosslessWebp = (): Uint8Array =>
  fromBase64("UklGRh4AAABXRUJQVlA4TBEAAAAvAkAAAAdQqCIXpf+BiOh/AAA=");

/** `sampleJpeg` with a frame header declaring `width`×`height`. */
export function jpegDeclaring(width: number, height: number): Uint8Array {
  const bytes = sampleJpeg();
  const sof = bytes.findIndex(
    (byte, i) => byte === 0xff && bytes[i + 1] === 0xc0,
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  view.setUint16(sof + 5, height);
  view.setUint16(sof + 7, width);
  return bytes;
}

const u24le = (value: number): Uint8Array =>
  Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff);

const u32le = (value: number): Uint8Array =>
  Uint8Array.of(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    value >>> 24,
  );

/**
 * An extended WebP (`VP8X`) whose canvas is `width`×`height`, over
 * `sampleLosslessWebp`'s image.
 */
export function webpDeclaring(width: number, height: number): Uint8Array {
  const lossless = sampleLosslessWebp().subarray(12);
  const chunks = concat(
    ascii("VP8X"),
    u32le(10),
    Uint8Array.of(0, 0, 0, 0),
    u24le(width - 1),
    u24le(height - 1),
    lossless,
  );
  return concat(ascii("RIFF"), u32le(4 + chunks.length), ascii("WEBP"), chunks);
}

/** 3×2 GIF: a format the inspector does not accept. */
export const sampleGif = (): Uint8Array =>
  fromBase64("R0lGODlhAwACAIAAAExpcchQKCH5BAUAAAAALAAAAAADAAIAAAICjF8AOw==");

/** The start of an MP4 video: an `ftyp` box and a short `mdat`. */
export const sampleVideo = (): Uint8Array =>
  concat(
    u32be(28),
    ascii("ftypisom"),
    u32be(0x200),
    ascii("isomiso2mp41"),
    u32be(16),
    ascii("mdat"),
    Uint8Array.of(0, 0, 0, 1, 0x67, 0x42, 0xc0, 0x1e),
  );

export const sampleText = (): Uint8Array =>
  ascii("This is a text file, not a photo.\n");

/** The first half of `bytes`: a file cut off in transfer. */
export const truncated = (bytes: Uint8Array): Uint8Array =>
  bytes.slice(0, Math.floor(bytes.length / 2));

/** A still-image signature followed by bytes that are not an image. */
export const disguisedAsPng = (): Uint8Array =>
  concat(
    samplePng().slice(0, 16),
    ascii("definitely not the rest of a png file"),
  );

export const disguisedAsJpeg = (): Uint8Array =>
  concat(
    Uint8Array.of(0xff, 0xd8, 0xff, 0xe0),
    ascii("garbage that only starts like a jpeg"),
  );
