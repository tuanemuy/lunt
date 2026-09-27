// `pnpm area:import <source> [--out <dir>]` — builds the area master's
// static JSON files (design.md D-08, format in
// `packages/core/src/adapters/area/assetFormat.ts`) from Japan Post's
// 「住所の郵便番号（1レコード1行、UTF-8形式）」.
//
//   <source>  utf_ken_all.csv, utf_ken_all.zip, or an http(s) URL of either
//             (e.g. https://www.post.japanpost.jp/zipcode/dl/utf/zip/utf_ken_all.zip)
//   --out     output directory (default: apps/web/public/area, gitignored)
//
// `pnpm area:import --test-master` rewrites the committed test master's
// files (packages/core/src/adapters/area/testing/testMasterAssets/area)
// from `TEST_AREA_MASTER`. Relative paths are resolved against the
// directory `pnpm` was started from.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import {
  AreaAssetPath,
  type AreaMasterRow,
  buildAreaAssets,
} from "@repo/core/adapters/area/assetFormat";
import { parseJapanPostCsv } from "@repo/core/adapters/area/japanPost";
import { TEST_AREA_MASTER } from "@repo/core/adapters/area/testing/testAreaMaster";

const WEB_ROOT = process.cwd();
const DEFAULT_OUT = path.join(WEB_ROOT, "public", "area");
const TEST_MASTER_OUT = path.join(
  WEB_ROOT,
  "..",
  "..",
  "packages/core/src/adapters/area/testing/testMasterAssets/area",
);
const LINE_WIDTH = 80;

const USAGE = `Usage:
  pnpm area:import <utf_ken_all.csv | utf_ken_all.zip | URL> [--out <dir>]
  pnpm area:import --test-master`;

function fromInvocationDir(target: string): string {
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), target);
}

/** The first `.csv` entry of a zip archive (stored or deflated). */
function unzipCsv(zip: Buffer): Buffer {
  const EOCD = 0x06054b50;
  const CENTRAL = 0x02014b50;
  const LOCAL = 0x04034b50;
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i -= 1) {
    if (zip.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip archive");
  const entries = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n += 1) {
    if (zip.readUInt32LE(offset) !== CENTRAL) {
      throw new Error("Broken zip central directory");
    }
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.toString("latin1", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (!name.toLowerCase().endsWith(".csv")) continue;
    if (zip.readUInt32LE(localOffset) !== LOCAL) {
      throw new Error("Broken zip local header");
    }
    const dataStart =
      localOffset +
      30 +
      zip.readUInt16LE(localOffset + 26) +
      zip.readUInt16LE(localOffset + 28);
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) return data;
    if (method === 8) return inflateRawSync(data);
    throw new Error(`Unsupported zip compression method ${method}`);
  }
  throw new Error("The zip archive has no .csv file");
}

async function readSource(source: string): Promise<string> {
  let bytes: Buffer;
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Downloading ${source} answered ${response.status}`);
    }
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    bytes = await readFile(fromInvocationDir(source));
  }
  const isZip = bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50;
  const csv = isZip ? unzipCsv(bytes) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(csv);
  } catch {
    throw new Error(
      "The data is not UTF-8. Use the UTF-8 version (utf_ken_all), not the Shift_JIS ken_all.csv",
    );
  }
}

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{20000}-\u{3FFFD}]/u;

/** Display columns, East Asian wide characters counting two. */
function width(text: string): number {
  let columns = 0;
  for (const char of text) columns += WIDE.test(char) ? 2 : 1;
  return columns;
}

/** An array of arrays and primitives on one line; `null` when it holds an object. */
function flatJson(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return typeof value === "object" && value !== null
      ? null
      : JSON.stringify(value);
  }
  const items = value.map(flatJson);
  return items.every((item) => item !== null) ? `[${items.join(", ")}]` : null;
}

/**
 * JSON the way Biome formats it (an array stays on one line when it fits
 * the line with what precedes and follows it; objects always break), so
 * committed output passes `pnpm format:check` as written.
 */
function formatJson(value: unknown, indent = "", lead = 0, tail = 0): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const flat = flatJson(value);
    if (flat !== null && lead + width(flat) + tail <= LINE_WIDTH) return flat;
    const inner = `${indent}  `;
    const items = value.map(
      (item, i) =>
        `${inner}${formatJson(item, inner, inner.length, i < value.length - 1 ? 1 : 0)}`,
    );
    return `[\n${items.join(",\n")}\n${indent}]`;
  }
  if (typeof value === "object" && value !== null) {
    const inner = `${indent}  `;
    const entries = Object.entries(value);
    const lines = entries.map(([key, item], i) => {
      const prefix = `${inner}${JSON.stringify(key)}: `;
      return `${prefix}${formatJson(item, inner, width(prefix), i < entries.length - 1 ? 1 : 0)}`;
    });
    return `{\n${lines.join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

async function writeAssets(
  rows: readonly AreaMasterRow[],
  outDir: string,
): Promise<number> {
  const files = buildAreaAssets(rows);
  const existing = await readdir(outDir).catch(() => null);
  if (existing !== null && existing.length > 0) {
    if (!existing.includes(AreaAssetPath.index)) {
      throw new Error(
        `${outDir} is not empty and holds no area master; refusing to replace it`,
      );
    }
    await rm(outDir, { recursive: true });
  }
  for (const [relative, value] of files) {
    const target = path.join(outDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${formatJson(value)}\n`);
  }
  return files.size;
}

async function main(args: readonly string[]): Promise<void> {
  if (args.includes("--test-master")) {
    const count = await writeAssets(TEST_AREA_MASTER, TEST_MASTER_OUT);
    console.log(
      `Wrote ${count} files of the test master to ${TEST_MASTER_OUT}`,
    );
    return;
  }
  const outFlag = args.indexOf("--out");
  const outArg = outFlag >= 0 ? args[outFlag + 1] : undefined;
  if (outFlag >= 0 && outArg === undefined) throw new Error(USAGE);
  const source = args.find(
    (arg, i) => !arg.startsWith("--") && (outFlag < 0 || i !== outFlag + 1),
  );
  if (source === undefined) throw new Error(USAGE);
  const outDir = outArg === undefined ? DEFAULT_OUT : fromInvocationDir(outArg);

  const rows = parseJapanPostCsv(await readSource(source));
  const count = await writeAssets(rows, outDir);
  const municipalities = new Set(rows.map((row) => row.municipalityCode));
  const prefectures = new Set(rows.map((row) => row.prefectureCode));
  console.log(
    `Wrote ${count} files to ${outDir}: ${prefectures.size} prefectures, ${municipalities.size} municipalities, ${rows.length} towns`,
  );
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
