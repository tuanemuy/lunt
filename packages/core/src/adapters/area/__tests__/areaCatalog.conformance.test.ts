import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describeAreaCatalogContract } from "../__conformance__/areaCatalog";
import { type AreaAssetFetcher, AssetAreaCatalog } from "../assetAreaCatalog";
import {
  createTestAreaCatalog,
  TEST_AREA_MASTER_BASE_PATH,
} from "../testing/testAreaMaster";

// The test master's files built in memory — what usecase tests read.
describeAreaCatalogContract("in-memory assets", async () =>
  createTestAreaCatalog(),
);

// The committed test-master files on disk, the directory the Workers pool
// serves through its static-assets binding.
const ASSETS_DIR = new URL("../testing/testMasterAssets", import.meta.url);

const diskAssets: AreaAssetFetcher = {
  async fetch(url) {
    const path = new URL(url).pathname;
    try {
      const body = await readFile(
        fileURLToPath(new URL(`.${path}`, `${ASSETS_DIR.href}/`)),
        "utf8",
      );
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    } catch {
      return { ok: false, status: 404, json: async () => null };
    }
  },
};

describeAreaCatalogContract(
  "committed asset files",
  async () =>
    new AssetAreaCatalog(diskAssets, {
      basePaths: [TEST_AREA_MASTER_BASE_PATH],
    }),
);
