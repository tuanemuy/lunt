import {
  AreaAssetCache,
  type AreaAssetFetcher,
  AssetAreaCatalog,
} from "@repo/core/adapters/area/assetAreaCatalog";
import type { AreaServices } from "../area/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment Area's wiring reads. */
export type AreaEnv = Readonly<{
  /**
   * The Worker's static-assets binding (`assets.binding` in
   * `wrangler.jsonc`). Optional only because test workers that never read
   * the master are built without it; reading the master then fails with a
   * `SystemError`.
   */
  ASSETS?: AreaAssetFetcher | undefined;
}>;

/** Where `pnpm area:import` puts the master (`apps/web/public/area/`). */
export const AREA_MASTER_BASE_PATH = "/area";

/**
 * The committed development sample (`apps/web/public/area-sample/`), read
 * only with the development tools on and only while no imported master
 * exists.
 */
export const AREA_SAMPLE_BASE_PATH = "/area-sample";

// Module scope is the isolate: every request's catalog shares the parsed
// files, and a new deployment (new master) starts new isolates.
const isolateAreaAssets = new AreaAssetCache();

const missingAssets: AreaAssetFetcher = {
  fetch: () =>
    Promise.reject(new Error("The ASSETS binding is not configured")),
};

export function createAreaServices(
  env: AreaEnv,
  deps: Pick<ServiceDeps, "runtime">,
): AreaServices {
  return {
    areaCatalog: new AssetAreaCatalog(env.ASSETS ?? missingAssets, {
      basePaths: deps.runtime.devTools
        ? [AREA_MASTER_BASE_PATH, AREA_SAMPLE_BASE_PATH]
        : [AREA_MASTER_BASE_PATH],
      cache: isolateAreaAssets,
    }),
  };
}
