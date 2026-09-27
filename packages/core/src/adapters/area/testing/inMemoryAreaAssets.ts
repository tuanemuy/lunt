import type { AreaAssetFetcher, AreaAssetResponse } from "../assetAreaCatalog";
import { type AreaMasterRow, buildAreaAssets } from "../assetFormat";

/**
 * An `AreaAssetFetcher` over files held in memory, keyed by their full
 * path (`/area/index.json`). Unknown paths answer 404; each response
 * gives a fresh copy, like a real fetch.
 */
export class InMemoryAreaAssets implements AreaAssetFetcher {
  private readonly files: ReadonlyMap<string, string>;
  private readonly requested: string[] = [];

  constructor(files: ReadonlyMap<string, unknown>) {
    this.files = new Map(
      [...files].map(([path, value]) => [path, JSON.stringify(value)]),
    );
  }

  /** The files of `rows` under `basePath`, as `pnpm area:import` writes them. */
  static fromRows(
    rows: readonly AreaMasterRow[],
    basePath: string,
  ): InMemoryAreaAssets {
    const base = basePath.replace(/\/+$/, "");
    return new InMemoryAreaAssets(
      new Map(
        [...buildAreaAssets(rows)].map(([path, value]) => [
          `${base}/${path}`,
          value,
        ]),
      ),
    );
  }

  /** Paths fetched so far, in order. */
  fetchedPaths(): readonly string[] {
    return this.requested;
  }

  async fetch(url: string): Promise<AreaAssetResponse> {
    const path = new URL(url).pathname;
    this.requested.push(path);
    const body = this.files.get(path);
    if (body === undefined) {
      return { ok: false, status: 404, json: async () => null };
    }
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  }
}
