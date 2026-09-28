/**
 * Development tool: a PNG that shows `label` in large letters on a coloured
 * background, so photos seeded for the manual tests
 * (`spec/manual-tests/*.md` 「写真用のファイル…ファイル名を画像の中に大きく
 * 描き込む」) can be told apart on screen. Pure and deterministic: the same
 * label gives the same bytes, different labels different bytes. Letters
 * outside `a–z 0–9 - . _ space` are drawn as `?` (upper case as lower case).
 */
export function seedPhotoPng(
  label: string,
  size: Readonly<{ width: number; height: number }> = {
    width: 640,
    height: 480,
  },
): Uint8Array {
  const { width, height } = size;
  const pixels = drawPixels(label, width, height);
  const scanlines = filterRows(pixels, width, height);
  const hue: Rgb = HUES[fnv1a(label) % HUES.length] ?? [128, 128, 128];
  const palette = [hue, shade(hue), [250, 250, 250], [34, 34, 34]] as const;
  return concat(
    PNG_SIGNATURE,
    chunk(
      "IHDR",
      concat(u32be(width), u32be(height), Uint8Array.of(8, 3, 0, 0, 0)),
    ),
    chunk("PLTE", Uint8Array.from(palette.flat())),
    chunk("IDAT", zlib(scanlines)),
    chunk("IEND", new Uint8Array(0)),
  );
}

type Rgb = readonly [number, number, number];

const HUES: readonly Rgb[] = [
  [231, 111, 81],
  [244, 162, 97],
  [233, 196, 106],
  [138, 177, 125],
  [42, 157, 143],
  [72, 149, 239],
  [106, 76, 147],
  [199, 125, 255],
  [239, 71, 111],
  [17, 138, 178],
  [156, 102, 68],
  [96, 108, 56],
];

const shade = ([r, g, b]: Rgb): Rgb => [
  Math.round(r * 0.7),
  Math.round(g * 0.7),
  Math.round(b * 0.7),
];

const BACKGROUND = 0;
const BAND = 1;
const PANEL = 2;
const INK = 3;

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;

// 5×7 glyphs, rows top to bottom, `#` = ink.
const FONT: Readonly<Record<string, string>> = {
  a: "..... ..... .###. ....# .#### #...# .####",
  b: "#.... #.... #.##. ##..# #...# #...# ####.",
  c: "..... ..... .###. #.... #.... #...# .###.",
  d: "....# ....# .##.# #..## #...# #...# .####",
  e: "..... ..... .###. #...# ##### #.... .###.",
  f: "..##. .#..# .#... ###.. .#... .#... .#...",
  g: "..... .#### #...# #...# .#### ....# .###.",
  h: "#.... #.... #.##. ##..# #...# #...# #...#",
  i: "..#.. ..... .##.. ..#.. ..#.. ..#.. .###.",
  j: "...#. ..... ..##. ...#. ...#. #..#. .##..",
  k: "#.... #.... #..#. #.#.. ##... #.#.. #..#.",
  l: ".##.. ..#.. ..#.. ..#.. ..#.. ..#.. .###.",
  m: "..... ..... ##.#. #.#.# #.#.# #...# #...#",
  n: "..... ..... #.##. ##..# #...# #...# #...#",
  o: "..... ..... .###. #...# #...# #...# .###.",
  p: "..... ####. #...# #...# ####. #.... #....",
  q: "..... .#### #...# #...# .#### ....# ....#",
  r: "..... ..... #.##. ##..# #.... #.... #....",
  s: "..... ..... .#### #.... .###. ....# ####.",
  t: ".#... .#... ###.. .#... .#... .#..# ..##.",
  u: "..... ..... #...# #...# #...# #..## .##.#",
  v: "..... ..... #...# #...# #...# .#.#. ..#..",
  w: "..... ..... #...# #...# #.#.# #.#.# .#.#.",
  x: "..... ..... #...# .#.#. ..#.. .#.#. #...#",
  y: "..... #...# #...# #...# .#### ....# .###.",
  z: "..... ..... ##### ...#. ..#.. .#... #####",
  "0": ".###. #...# #..## #.#.# ##..# #...# .###.",
  "1": "..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.",
  "2": ".###. #...# ....# ...#. ..#.. .#... #####",
  "3": "##### ...#. ..#.. ...#. ....# #...# .###.",
  "4": "...#. ..##. .#.#. #..#. ##### ...#. ...#.",
  "5": "##### #.... ####. ....# ....# #...# .###.",
  "6": "..##. .#... #.... ####. #...# #...# .###.",
  "7": "##### ....# ...#. ..#.. .#... .#... .#...",
  "8": ".###. #...# #...# .###. #...# #...# .###.",
  "9": ".###. #...# #...# .#### ....# ...#. .##..",
  "-": "..... ..... ..... ##### ..... ..... .....",
  ".": "..... ..... ..... ..... ..... .##.. .##..",
  _: "..... ..... ..... ..... ..... ..... #####",
  " ": "..... ..... ..... ..... ..... ..... .....",
  "?": ".###. #...# ....# ...#. ..#.. ..... ..#..",
};

const glyphOf = (char: string): readonly string[] =>
  (FONT[char.toLowerCase()] ?? FONT["?"] ?? "").split(" ");

/** A long label breaks before its extension: `kuzumochi-1` / `.jpg`. */
function splitLabel(label: string): readonly (readonly string[])[] {
  const chars = [...label];
  const dot = chars.lastIndexOf(".");
  return chars.length > 8 && dot > 0
    ? [chars.slice(0, dot), chars.slice(dot)]
    : [chars];
}

function drawPixels(label: string, width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height).fill(BACKGROUND);
  const fill = (x0: number, y0: number, w: number, h: number, v: number) => {
    const x1 = Math.min(width, x0 + w);
    const y1 = Math.min(height, y0 + h);
    for (let y = Math.max(0, y0); y < y1; y++) {
      pixels.fill(v, y * width + Math.max(0, x0), y * width + x1);
    }
  };

  // A checkered band at the top and bottom.
  const block = Math.max(4, Math.floor(height / 10));
  for (let x = 0; x * block < width; x++) {
    fill(x * block, x % 2 === 0 ? 0 : block, block, block, BAND);
    fill(
      x * block,
      height - (x % 2 === 0 ? block : 2 * block),
      block,
      block,
      BAND,
    );
  }

  const lines = splitLabel(label);
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const advance = GLYPH_WIDTH + 1;
  const lineHeight = GLYPH_HEIGHT + 2;
  const margin = Math.max(2, Math.floor(width / 32));
  // The label stays inside the centred square, which square crops keep.
  const textArea = Math.min(width, height) - 4 * margin;
  const scale = Math.max(
    1,
    Math.min(
      Math.floor(textArea / (longest * advance)),
      Math.floor((height - 4 * block) / (lines.length * lineHeight)),
    ),
  );
  const textWidth = (longest * advance - 1) * scale;
  const textHeight = (lines.length * lineHeight - 2) * scale;
  const left = Math.floor((width - textWidth) / 2);
  const top = Math.floor((height - textHeight) / 2);
  fill(
    left - margin,
    top - margin,
    textWidth + 2 * margin,
    textHeight + 2 * margin,
    PANEL,
  );
  lines.forEach((line, ly) => {
    const lineLeft =
      left + Math.floor(((longest - line.length) * advance * scale) / 2);
    line.forEach((char, i) => {
      glyphOf(char).forEach((row, gy) => {
        [...row].forEach((dot, gx) => {
          if (dot !== "#") return;
          fill(
            lineLeft + (i * advance + gx) * scale,
            top + (ly * lineHeight + gy) * scale,
            scale,
            scale,
            INK,
          );
        });
      });
    });
  });
  return pixels;
}

/** Each row with PNG filter Up when it repeats the row above (all zeros), else None. */
function filterRows(
  pixels: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * width, (y + 1) * width);
    const at = y * (width + 1);
    const repeats =
      y > 0 && row.every((value, x) => value === pixels[(y - 1) * width + x]);
    out[at] = repeats ? 2 : 0;
    if (!repeats) out.set(row, at + 1);
  }
  return out;
}

const PNG_SIGNATURE = Uint8Array.of(
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
);

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
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = concat(
    Uint8Array.from(type, (c) => c.charCodeAt(0)),
    data,
  );
  return concat(u32be(data.length), typed, u32be(crc32(typed)));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
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

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258,
] as const;
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0,
] as const;
const MAX_MATCH = 258;

/**
 * A zlib stream of `raw` in one fixed-Huffman deflate block whose only
 * back-references repeat the previous byte (distance 1) — enough for the
 * long runs a flat drawing filters into.
 */
function zlib(raw: Uint8Array): Uint8Array {
  const out: number[] = [0x78, 0x01];
  let bitBuffer = 0;
  let bitCount = 0;
  const bits = (value: number, count: number) => {
    for (let i = 0; i < count; i++) {
      bitBuffer |= ((value >>> i) & 1) << bitCount;
      bitCount++;
      if (bitCount === 8) {
        out.push(bitBuffer);
        bitBuffer = 0;
        bitCount = 0;
      }
    }
  };
  // Huffman codes are packed most significant bit first.
  const code = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits((value >>> i) & 1, 1);
  };
  const symbol = (sym: number) => {
    if (sym <= 143) code(0x30 + sym, 8);
    else if (sym <= 255) code(0x190 + sym - 144, 9);
    else if (sym <= 279) code(sym - 256, 7);
    else code(0xc0 + sym - 280, 8);
  };
  const repeat = (length: number) => {
    let index = LENGTH_BASE.length - 1;
    while ((LENGTH_BASE[index] ?? 0) > length) index--;
    symbol(257 + index);
    bits(length - (LENGTH_BASE[index] ?? 0), LENGTH_EXTRA[index] ?? 0);
    code(0, 5);
  };

  bits(1, 1);
  bits(1, 2);
  let i = 0;
  while (i < raw.length) {
    if (i > 0) {
      const previous = raw[i - 1];
      let run = 0;
      while (
        run < MAX_MATCH &&
        i + run < raw.length &&
        raw[i + run] === previous
      ) {
        run++;
      }
      if (run >= 3) {
        repeat(run);
        i += run;
        continue;
      }
    }
    symbol(raw[i] ?? 0);
    i++;
  }
  symbol(256);
  if (bitCount > 0) out.push(bitBuffer);
  return concat(Uint8Array.from(out), u32be(adler32(raw)));
}
