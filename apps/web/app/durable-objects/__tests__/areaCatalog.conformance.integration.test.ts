import { env } from "cloudflare:test";
import { describeAreaCatalogContract } from "@repo/core/adapters/staticAssets/__conformance__/areaCatalog";
import {
  type AreaAssetFetcher,
  AssetAreaCatalog,
} from "@repo/core/adapters/staticAssets/assetAreaCatalog";
import { TEST_AREA_MASTER_BASE_PATH } from "@repo/core/adapters/staticAssets/testing/testAreaMaster";

// The committed test-master files served by the Workers static-assets
// binding (`vitest.config.integration.ts` points `assets.directory` at
// packages/core/src/adapters/staticAssets/testing/testMasterAssets), read the way
// the Worker reads `env.ASSETS`.
const assets = (env as unknown as { ASSETS?: AreaAssetFetcher }).ASSETS;

describeAreaCatalogContract("Workers static assets", async () => {
  if (assets === undefined) {
    throw new Error(
      "The Workers pool has no ASSETS binding; add `assets` to vitest.config.integration.ts",
    );
  }
  return new AssetAreaCatalog(assets, {
    basePaths: [TEST_AREA_MASTER_BASE_PATH],
  });
});
