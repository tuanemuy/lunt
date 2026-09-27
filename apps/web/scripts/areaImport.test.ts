import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AreaAssetFetcher } from "@repo/core/adapters/area/assetAreaCatalog";
import { buildAreaAssets } from "@repo/core/adapters/area/assetFormat";
import { parseJapanPostCsv } from "@repo/core/adapters/area/japanPost";
import { createAreaServices } from "@repo/core/application/di/area";
import { PostalCode } from "@repo/core/domain/area/postalCode";
import { Town } from "@repo/core/domain/area/town";
import { describe, expect, it } from "vitest";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SAMPLE_CSV = path.join(WEB_ROOT, "scripts", "areaSample.csv");
const PUBLIC_DIR = path.join(WEB_ROOT, "public");
const SAMPLE_DIR = path.join(PUBLIC_DIR, "area-sample");

const loadSample = async () =>
  parseJapanPostCsv(await readFile(SAMPLE_CSV, "utf8"));

async function readTree(dir: string): Promise<Map<string, unknown>> {
  const files = new Map<string, unknown>();
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    files.set(
      path.relative(dir, full).split(path.sep).join("/"),
      JSON.parse(await readFile(full, "utf8")),
    );
  }
  return files;
}

/** `env.ASSETS` over `apps/web/public`, as `pnpm dev` serves it. */
const publicAssets: AreaAssetFetcher = {
  async fetch(url) {
    const file = path.join(PUBLIC_DIR, new URL(url).pathname);
    try {
      const body = await readFile(file, "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    } catch {
      return { ok: false, status: 404, json: async () => null };
    }
  },
};

describe("the development sample (scripts/areaSample.csv → public/area-sample)", () => {
  it("has the towns the manual tests use, and no business-specific code", async () => {
    const rows = await loadSample();
    const names = (postal: string) =>
      rows
        .filter((row) => row.areaCode === postal)
        .map(
          (row) => `${row.prefectureName}${row.municipalityName}${row.name}`,
        );
    expect(names("1100001")).toEqual(["東京都台東区谷中"]);
    expect(names("1100005")).toEqual(["東京都台東区上野"]);
    expect(names("1130031")).toEqual(["東京都文京区根津"]);
    expect(names("1130022")).toEqual(["東京都文京区千駄木"]);
    expect(names("2310023")).toEqual(["神奈川県横浜市中区山下町"]);
    expect(names("1040061")).toEqual(["東京都中央区銀座"]);
    expect(names("1010041")).toEqual(["東京都千代田区神田須田町"]);
    expect(names("5300001")).toEqual(["大阪府大阪市北区梅田"]);
    for (const present of ["1000004", "1000005", "1030027"]) {
      expect(names(present)).toHaveLength(1);
    }
    for (const absent of ["1008994", "0000000", "9999999"]) {
      expect(names(absent)).toEqual([]);
    }
  });

  it("is committed as built (regenerate: pnpm area:import apps/web/scripts/areaSample.csv --out apps/web/public/area-sample)", async () => {
    expect(await readTree(SAMPLE_DIR)).toEqual(
      new Map(buildAreaAssets(await loadSample())),
    );
  });

  it("answers postal code lookups through the development wiring", async () => {
    const { areaCatalog } = createAreaServices(
      { ASSETS: publicAssets },
      {
        runtime: {
          devTools: true,
          sessionSecret: "unused",
          opsToken: null,
        },
      },
    );
    const towns = await areaCatalog.findTownsByPostalCode(
      PostalCode.create("110-0001"),
    );
    expect(towns.map(Town.label)).toEqual(["110-0001 東京都台東区谷中"]);
  });
});
