import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SystemError } from "@repo/core/application/errors";
import { MunicipalityCode, PrefectureCode } from "@repo/core/domain/area/codes";
import { PostalCode } from "@repo/core/domain/area/postalCode";
import { describe, expect, it } from "vitest";
import { InMemoryAreaAssets } from "../../inMemory/inMemoryAreaAssets";
import {
  AreaAssetCache,
  type AreaAssetFetcher,
  AssetAreaCatalog,
} from "../assetAreaCatalog";
import { type AreaMasterRow, buildAreaAssets } from "../assetFormat";
import { TEST_AREA_MASTER } from "../testing/testAreaMaster";

const YANAKA: AreaMasterRow = {
  areaCode: "1100001",
  prefectureCode: "13",
  prefectureName: "東京都",
  municipalityCode: "13106",
  municipalityName: "台東区",
  name: "谷中",
  kana: "ヤナカ",
};
const SAMPLE: readonly AreaMasterRow[] = [YANAKA];

async function expectSystemError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(SystemError);
  expect((error as SystemError).code).toBe(code);
}

describe("AssetAreaCatalog", () => {
  it("reads each file once per cache, across catalogs sharing it", async () => {
    const assets = InMemoryAreaAssets.fromRows(TEST_AREA_MASTER, "/area");
    const cache = new AreaAssetCache();
    const first = new AssetAreaCatalog(assets, {
      basePaths: ["/area"],
      cache,
    });
    const second = new AssetAreaCatalog(assets, {
      basePaths: ["/area"],
      cache,
    });
    await first.listTowns(MunicipalityCode.create("13101"));
    await second.listTowns(MunicipalityCode.create("13102"));
    await second.findTownsByPostalCode(PostalCode.create("1040061"));
    await first.findTownsByPostalCode(PostalCode.create("1040061"));
    expect(assets.fetchedPaths()).toEqual([
      "/area/index.json",
      "/area/towns/13.json",
      "/area/postal/104.json",
    ]);
  });

  it("does not fetch for codes the index lacks", async () => {
    const assets = InMemoryAreaAssets.fromRows(TEST_AREA_MASTER, "/area");
    const catalog = new AssetAreaCatalog(assets, { basePaths: ["/area"] });
    expect(await catalog.listTowns(MunicipalityCode.create("47201"))).toEqual(
      [],
    );
    expect(
      await catalog.findTownsByPostalCode(PostalCode.create("0000000")),
    ).toEqual([]);
    expect(assets.fetchedPaths()).toEqual(["/area/index.json"]);
  });

  it("uses the first base path that has a master, falling back to later ones", async () => {
    const assets = InMemoryAreaAssets.fromRows(SAMPLE, "/area-sample");
    const catalog = new AssetAreaCatalog(assets, {
      basePaths: ["/area", "/area-sample"],
    });
    expect(await catalog.listPrefectures()).toEqual([
      { code: "13", name: "東京都" },
    ]);
    const imported = new InMemoryAreaAssets(
      new Map([
        ...[...buildAreaAssets(TEST_AREA_MASTER)].map(
          ([path, value]) => [`/area/${path}`, value] as const,
        ),
        ...[...buildAreaAssets(SAMPLE)].map(
          ([path, value]) => [`/area-sample/${path}`, value] as const,
        ),
      ]),
    );
    const preferred = new AssetAreaCatalog(imported, {
      basePaths: ["/area", "/area-sample"],
    });
    expect(
      (await preferred.listPrefectures()).map((prefecture) => prefecture.code),
    ).toEqual(["13", "27"]);
  });

  it("fails with DATA_INTEGRITY_ERROR when no base path has a master", async () => {
    const catalog = new AssetAreaCatalog(new InMemoryAreaAssets(new Map()), {
      basePaths: ["/area"],
    });
    await expectSystemError(catalog.listPrefectures(), "DATA_INTEGRITY_ERROR");
  });

  it("fails with DATA_INTEGRITY_ERROR when a file the index lists is missing", async () => {
    const files = new Map(
      [...buildAreaAssets(TEST_AREA_MASTER)]
        .filter(([path]) => path !== "towns/27.json")
        .map(([path, value]) => [`/area/${path}`, value] as const),
    );
    const catalog = new AssetAreaCatalog(new InMemoryAreaAssets(files), {
      basePaths: ["/area"],
    });
    await expectSystemError(
      catalog.listTowns(MunicipalityCode.create("27127")),
      "DATA_INTEGRITY_ERROR",
    );
  });

  it("fails with DATA_INTEGRITY_ERROR on a malformed file, and retries it later", async () => {
    const files = new Map<string, unknown>(
      [...buildAreaAssets(TEST_AREA_MASTER)].map(([path, value]) => [
        `/area/${path}`,
        value,
      ]),
    );
    files.set("/area/towns/13.json", [["1000000", "13101"]]);
    const assets = new InMemoryAreaAssets(files);
    const catalog = new AssetAreaCatalog(assets, { basePaths: ["/area"] });
    await expectSystemError(
      catalog.listTowns(MunicipalityCode.create("13101")),
      "DATA_INTEGRITY_ERROR",
    );
    await expectSystemError(
      catalog.listTowns(MunicipalityCode.create("13101")),
      "DATA_INTEGRITY_ERROR",
    );
    expect(
      assets.fetchedPaths().filter((path) => path === "/area/towns/13.json"),
    ).toHaveLength(2);
  });

  it("fails with DATA_INTEGRITY_ERROR when a town's municipality is not in the index", async () => {
    const files = new Map<string, unknown>(
      [...buildAreaAssets(TEST_AREA_MASTER)].map(([path, value]) => [
        `/area/${path}`,
        value,
      ]),
    );
    files.set("/area/towns/13.json", [["1000000", "13199", "", ""]]);
    const catalog = new AssetAreaCatalog(new InMemoryAreaAssets(files), {
      basePaths: ["/area"],
    });
    await expectSystemError(
      catalog.expand([
        { unit: "prefecture", prefectureCode: PrefectureCode.create("13") },
      ]),
      "DATA_INTEGRITY_ERROR",
    );
  });

  it("fails with EXTERNAL_API_ERROR when the fetch fails or answers an error", async () => {
    const throwing: AreaAssetFetcher = {
      fetch: () => Promise.reject(new Error("down")),
    };
    await expectSystemError(
      new AssetAreaCatalog(throwing, {
        basePaths: ["/area"],
      }).listPrefectures(),
      "EXTERNAL_API_ERROR",
    );
    const failing: AreaAssetFetcher = {
      fetch: async () => ({ ok: false, status: 500, json: async () => null }),
    };
    await expectSystemError(
      new AssetAreaCatalog(failing, { basePaths: ["/area"] }).listPrefectures(),
      "EXTERNAL_API_ERROR",
    );
  });
});

describe("buildAreaAssets", () => {
  it("matches the committed test-master files (regenerate: pnpm area:import --test-master)", async () => {
    const dir = new URL("../testing/testMasterAssets/area/", import.meta.url);
    const committed = new Map<string, unknown>();
    for (const sub of ["", "towns/", "postal/"]) {
      const entries = await readdir(fileURLToPath(new URL(sub, dir)), {
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const relative = `${sub}${entry.name}`;
        committed.set(
          relative,
          JSON.parse(
            await readFile(fileURLToPath(new URL(relative, dir)), "utf8"),
          ),
        );
      }
    }
    expect(committed).toEqual(new Map(buildAreaAssets(TEST_AREA_MASTER)));
  });

  it.each<[string, readonly AreaMasterRow[]]>([
    [
      "a municipality outside its prefecture",
      [{ ...YANAKA, municipalityCode: "14106" }],
    ],
    [
      "one code with two names",
      [...SAMPLE, { ...YANAKA, areaCode: "1100002", municipalityName: "台東" }],
    ],
    ["the same town twice", [...SAMPLE, ...SAMPLE]],
    ["a malformed postal code", [{ ...YANAKA, areaCode: "110-0001" }]],
  ])("refuses %s", (_label, rows) => {
    expect(() => buildAreaAssets(rows)).toThrow();
  });

  it("keeps any number of unnamed towns in one municipality, told apart by postal code", () => {
    const rows: readonly AreaMasterRow[] = [
      { ...YANAKA, areaCode: "1100000", name: "", kana: "" },
      { ...YANAKA, areaCode: "1100008", name: "", kana: "" },
      { ...YANAKA, areaCode: "1100009", name: "", kana: "" },
    ];
    expect(() => buildAreaAssets(rows)).not.toThrow();
  });

  it("serves a municipality's two unnamed towns — the whole municipality and 「…の次に番地がくる場合」 — first, by postal code", async () => {
    const okaya = {
      prefectureCode: "20",
      prefectureName: "長野県",
      municipalityCode: "20204",
      municipalityName: "岡谷市",
    } as const;
    const rows: readonly AreaMasterRow[] = [
      { ...okaya, areaCode: "3940091", name: "", kana: "" },
      { ...okaya, areaCode: "3940002", name: "赤羽", kana: "アカハネ" },
      { ...okaya, areaCode: "3940000", name: "", kana: "" },
    ];
    const catalog = new AssetAreaCatalog(
      InMemoryAreaAssets.fromRows(rows, "/area"),
      { basePaths: ["/area"] },
    );

    const towns = await catalog.listTowns(MunicipalityCode.create("20204"));

    expect(towns.map((town) => [town.areaCode, town.name])).toEqual([
      ["3940000", ""],
      ["3940091", ""],
      ["3940002", "赤羽"],
    ]);
    const [numberFollows] = await catalog.findTownsByPostalCode(
      PostalCode.create("3940091"),
    );
    expect(numberFollows?.name).toBe("");
    expect(numberFollows?.municipality.name).toBe("岡谷市");
  });
});
