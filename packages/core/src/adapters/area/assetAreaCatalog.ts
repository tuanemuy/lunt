import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import {
  type AreaSelection,
  type AreaSelectionLabel,
  AreaSelectionLabel as SelectionLabel,
} from "@repo/core/domain/area/areaSelection";
import { MunicipalityCode, PrefectureCode } from "@repo/core/domain/area/codes";
import type { AreaCatalog } from "@repo/core/domain/area/ports/areaCatalog";
import type { PostalCode } from "@repo/core/domain/area/postalCode";
import {
  type Municipality,
  type Prefecture,
  Town,
} from "@repo/core/domain/area/town";
import { TownRef } from "@repo/core/domain/area/townRef";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import { z } from "zod";
import { AREA_ASSET_FORMAT, AreaAssetPath } from "./assetFormat";

/** What the adapter needs of a response: the Workers `Response` fits. */
export type AreaAssetResponse = Readonly<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/**
 * Where the asset files come from: the Workers static-assets binding
 * (`env.ASSETS`, a `Fetcher`) in the Worker, an in-memory map in tests.
 * Only the URL's path matters.
 */
export interface AreaAssetFetcher {
  fetch(url: string): Promise<AreaAssetResponse>;
}

type LoadedIndex = Readonly<{
  base: string;
  prefectures: readonly Prefecture[];
  prefectureByCode: ReadonlyMap<string, Prefecture>;
  municipalitiesByPrefecture: ReadonlyMap<string, readonly Municipality[]>;
  municipalityByCode: ReadonlyMap<string, Municipality>;
  postalPrefixes: ReadonlySet<string>;
}>;

/** Towns grouped by municipality or by area code, each group in `Town.compare` order. */
type TownGroups = ReadonlyMap<string, readonly Town[]>;

class LruPromiseCache<V> {
  private readonly entries = new Map<string, Promise<V>>();

  constructor(private readonly capacity: number) {}

  get(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.entries.get(key);
    if (hit !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const loading = load();
    this.entries.set(key, loading);
    loading.catch(() => {
      if (this.entries.get(key) === loading) this.entries.delete(key);
    });
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
    return loading;
  }
}

/**
 * Parsed asset files, shared by every `AssetAreaCatalog` built over it.
 * The Worker keeps one per isolate (`application/di/area.ts`): the master
 * only changes with a deployment, which starts new isolates. Prefecture
 * and postal files are kept least-recently-used first out, so an isolate
 * that walks the whole country does not hold all of it.
 */
export class AreaAssetCache {
  readonly indexes = new LruPromiseCache<LoadedIndex>(8);
  readonly prefectureTowns = new LruPromiseCache<TownGroups>(16);
  readonly postalTowns = new LruPromiseCache<TownGroups>(256);
}

const indexSchema = z.object({
  format: z.literal(AREA_ASSET_FORMAT),
  prefectures: z.array(z.tuple([z.string(), z.string()])),
  municipalities: z.array(z.tuple([z.string(), z.string()])),
  postalPrefixes: z.array(z.string()),
});

const townRowsSchema = z.array(
  z.tuple([z.string(), z.string(), z.string(), z.string()]),
);

const ORIGIN = "https://area-assets.invalid";

function integrityError(message: string, cause?: unknown): SystemError {
  return new SystemError(SystemErrorCode.DataIntegrityError, message, cause);
}

function byCodeAscending<T extends Readonly<{ code: string }>>(
  a: T,
  b: T,
): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

export type AssetAreaCatalogOptions = Readonly<{
  /**
   * Base paths to try in order; the first whose `index.json` exists is the
   * master (a later one is a fallback, e.g. the development sample).
   */
  basePaths: readonly string[];
  cache?: AreaAssetCache | undefined;
}>;

/**
 * `AreaCatalog` over the static JSON files of `assetFormat.ts`. A missing
 * master, a file the index promises but the assets lack, or content that
 * breaks the format is `SystemError(DATA_INTEGRITY_ERROR)`; a failing
 * fetch is `SystemError(EXTERNAL_API_ERROR)`.
 */
export class AssetAreaCatalog implements AreaCatalog {
  private readonly basePaths: readonly string[];
  private readonly cache: AreaAssetCache;

  constructor(
    private readonly fetcher: AreaAssetFetcher,
    options: AssetAreaCatalogOptions,
  ) {
    this.basePaths = options.basePaths.map((base) => base.replace(/\/+$/, ""));
    this.cache = options.cache ?? new AreaAssetCache();
  }

  async listPrefectures(): Promise<readonly Prefecture[]> {
    return (await this.index()).prefectures;
  }

  async listMunicipalities(
    prefectureCode: PrefectureCode,
  ): Promise<readonly Municipality[]> {
    return (
      (await this.index()).municipalitiesByPrefecture.get(prefectureCode) ?? []
    );
  }

  async listTowns(
    municipalityCode: MunicipalityCode,
  ): Promise<readonly Town[]> {
    const index = await this.index();
    if (!index.municipalityByCode.has(municipalityCode)) return [];
    const groups = await this.townsOfPrefecture(
      index,
      MunicipalityCode.prefectureOf(municipalityCode),
    );
    return groups.get(municipalityCode) ?? [];
  }

  findTownsByPostalCode(postalCode: PostalCode): Promise<readonly Town[]> {
    return this.townsWithAreaCode(postalCode);
  }

  async findTown(ref: TownRef): Promise<Town | null> {
    const towns = await this.listTowns(ref.municipalityCode);
    return towns.find((town) => TownRef.matches(ref, town)) ?? null;
  }

  async expand(
    selections: readonly AreaSelection[],
  ): Promise<ReadonlySet<AreaCode>> {
    const codes = new Set<AreaCode>();
    const index = await this.index();
    for (const selection of selections) {
      const towns = await this.townsSelected(index, selection);
      for (const town of towns) codes.add(town.areaCode);
    }
    return codes;
  }

  async labelSelections(
    selections: readonly AreaSelection[],
  ): Promise<readonly AreaSelectionLabel[]> {
    const index = await this.index();
    const labels: AreaSelectionLabel[] = [];
    for (const selection of selections) {
      const label = await this.labelOf(index, selection);
      if (label !== null) labels.push(label);
    }
    return labels;
  }

  private async townsSelected(
    index: LoadedIndex,
    selection: AreaSelection,
  ): Promise<readonly Town[]> {
    switch (selection.unit) {
      case "prefecture": {
        if (!index.prefectureByCode.has(selection.prefectureCode)) return [];
        const groups = await this.townsOfPrefecture(
          index,
          selection.prefectureCode,
        );
        return [...groups.values()].flat();
      }
      case "municipality":
        return this.listTowns(selection.municipalityCode);
      case "area":
        return this.townsWithAreaCode(selection.areaCode);
    }
  }

  private async labelOf(
    index: LoadedIndex,
    selection: AreaSelection,
  ): Promise<AreaSelectionLabel | null> {
    switch (selection.unit) {
      case "prefecture": {
        const prefecture = index.prefectureByCode.get(selection.prefectureCode);
        return prefecture === undefined
          ? null
          : SelectionLabel.ofPrefecture(selection, prefecture);
      }
      case "municipality": {
        const municipality = index.municipalityByCode.get(
          selection.municipalityCode,
        );
        const prefecture =
          municipality === undefined
            ? undefined
            : index.prefectureByCode.get(municipality.prefectureCode);
        return municipality === undefined || prefecture === undefined
          ? null
          : SelectionLabel.ofMunicipality(selection, prefecture, municipality);
      }
      case "area": {
        const [first] = await this.townsWithAreaCode(selection.areaCode);
        return first === undefined
          ? null
          : SelectionLabel.ofArea(selection, first);
      }
    }
  }

  private async townsWithAreaCode(areaCode: string): Promise<readonly Town[]> {
    const index = await this.index();
    const prefix = AreaAssetPath.postalPrefixOf(areaCode);
    if (!index.postalPrefixes.has(prefix)) return [];
    const path = AreaAssetPath.postal(prefix);
    const groups = await this.cache.postalTowns.get(
      `${index.base}/${path}`,
      async () =>
        groupTowns(
          index,
          await this.readRequired(index.base, path),
          path,
          (town) => town.areaCode,
          (town) => AreaAssetPath.postalPrefixOf(town.areaCode) === prefix,
        ),
    );
    return groups.get(areaCode) ?? [];
  }

  private townsOfPrefecture(
    index: LoadedIndex,
    prefectureCode: string,
  ): Promise<TownGroups> {
    const path = AreaAssetPath.towns(prefectureCode);
    return this.cache.prefectureTowns.get(`${index.base}/${path}`, async () =>
      groupTowns(
        index,
        await this.readRequired(index.base, path),
        path,
        (town) => town.municipality.code,
        (town) => town.prefecture.code === prefectureCode,
      ),
    );
  }

  private index(): Promise<LoadedIndex> {
    return this.cache.indexes.get(this.basePaths.join("\n"), async () => {
      for (const base of this.basePaths) {
        const raw = await this.read(base, AreaAssetPath.index);
        if (raw !== null) return parseIndex(base, raw);
      }
      throw integrityError(
        `The area master is missing: no ${AreaAssetPath.index} under ${this.basePaths.join(", ")} (run \`pnpm area:import\`)`,
      );
    });
  }

  private async readRequired(base: string, path: string): Promise<unknown> {
    const raw = await this.read(base, path);
    if (raw === null) {
      throw integrityError(
        `The area master lists ${base}/${path}, but it is missing`,
      );
    }
    return raw;
  }

  /** The parsed JSON of a file, or `null` when it does not exist. */
  private async read(base: string, path: string): Promise<unknown> {
    const url = new URL(`${base}/${path}`, ORIGIN).href;
    let response: AreaAssetResponse;
    try {
      response = await this.fetcher.fetch(url);
    } catch (error) {
      throw new SystemError(
        SystemErrorCode.ExternalApiError,
        `Reading the area master file ${base}/${path} failed`,
        error,
      );
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new SystemError(
        SystemErrorCode.ExternalApiError,
        `Reading the area master file ${base}/${path} answered ${response.status}`,
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw integrityError(
        `The area master file ${base}/${path} is not JSON`,
        error,
      );
    }
  }
}

function parseIndex(base: string, raw: unknown): LoadedIndex {
  const parsed = indexSchema.safeParse(raw);
  if (!parsed.success) {
    throw integrityError(
      `The area master index ${base}/${AreaAssetPath.index} is malformed`,
      parsed.error,
    );
  }
  try {
    const prefectures = parsed.data.prefectures
      .map(
        ([code, name]): Prefecture => ({
          code: PrefectureCode.create(code),
          name,
        }),
      )
      .sort(byCodeAscending);
    const prefectureByCode = new Map(prefectures.map((p) => [p.code, p]));
    const municipalities = parsed.data.municipalities
      .map(([code, name]): Municipality => {
        const municipalityCode = MunicipalityCode.create(code);
        const prefectureCode = MunicipalityCode.prefectureOf(municipalityCode);
        if (!prefectureByCode.has(prefectureCode)) {
          throw new Error(`Municipality ${code} has no prefecture`);
        }
        return { code: municipalityCode, prefectureCode, name };
      })
      .sort(byCodeAscending);
    const municipalitiesByPrefecture = new Map<string, Municipality[]>();
    for (const municipality of municipalities) {
      const list = municipalitiesByPrefecture.get(municipality.prefectureCode);
      if (list === undefined) {
        municipalitiesByPrefecture.set(municipality.prefectureCode, [
          municipality,
        ]);
      } else {
        list.push(municipality);
      }
    }
    return {
      base,
      prefectures,
      prefectureByCode,
      municipalitiesByPrefecture,
      municipalityByCode: new Map(municipalities.map((m) => [m.code, m])),
      postalPrefixes: new Set(parsed.data.postalPrefixes),
    };
  } catch (error) {
    throw integrityError(
      `The area master index ${base}/${AreaAssetPath.index} is inconsistent`,
      error,
    );
  }
}

function groupTowns(
  index: LoadedIndex,
  raw: unknown,
  path: string,
  keyOf: (town: Town) => string,
  belongs: (town: Town) => boolean,
): TownGroups {
  const parsed = townRowsSchema.safeParse(raw);
  if (!parsed.success) {
    throw integrityError(
      `The area master file ${index.base}/${path} is malformed`,
      parsed.error,
    );
  }
  const groups = new Map<string, Town[]>();
  try {
    for (const [areaCode, municipalityCode, name, kana] of parsed.data) {
      const municipality = index.municipalityByCode.get(municipalityCode);
      const prefecture =
        municipality === undefined
          ? undefined
          : index.prefectureByCode.get(municipality.prefectureCode);
      if (municipality === undefined || prefecture === undefined) {
        throw new Error(`Municipality ${municipalityCode} is not in the index`);
      }
      const town: Town = {
        areaCode: AreaCode.create(areaCode),
        prefecture,
        municipality,
        name,
        kana,
      };
      if (!belongs(town)) {
        throw new Error(`Town ${areaCode} ${name} does not belong here`);
      }
      const key = keyOf(town);
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [town]);
      else group.push(town);
    }
  } catch (error) {
    throw integrityError(
      `The area master file ${index.base}/${path} is inconsistent`,
      error,
    );
  }
  for (const group of groups.values()) group.sort(Town.compare);
  return groups;
}
