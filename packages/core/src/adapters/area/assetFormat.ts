/**
 * The area master as static JSON files (design.md D-08), served as Workers
 * static assets under a base path (`/area` for the imported master):
 *
 * - `index.json` — `{ format, prefectures: [code, name][], municipalities:
 *   [code, name][], postalPrefixes: string[] }`. Every prefecture and
 *   municipality that has a town, and the first three digits of every
 *   town's postal code.
 * - `towns/{prefectureCode}.json` — `[areaCode, municipalityCode, name,
 *   kana][]`, every town of the prefecture.
 * - `postal/{first three digits}.json` — the same rows, every town whose
 *   postal code starts with those digits.
 *
 * One lookup reads `index.json` plus at most one prefecture file per
 * prefecture it touches, or one postal file; the largest prefecture file of
 * the national data is a few hundred kilobytes.
 */
import { MunicipalityCode, PrefectureCode } from "@repo/core/domain/area/codes";
import { AreaCode } from "@repo/core/domain/common/areaCode";

export const AREA_ASSET_FORMAT = 1;

export const AreaAssetPath = {
  index: "index.json",
  towns: (prefectureCode: string): string => `towns/${prefectureCode}.json`,
  postal: (prefix: string): string => `postal/${prefix}.json`,
  postalPrefixOf: (areaCode: string): string => areaCode.slice(0, 3),
};

/** One town of the master before it is split into files. */
export type AreaMasterRow = Readonly<{
  areaCode: string;
  prefectureCode: string;
  prefectureName: string;
  municipalityCode: string;
  municipalityName: string;
  /** Empty for the town that stands for the whole municipality. */
  name: string;
  kana: string;
}>;

export type AreaAssetIndex = Readonly<{
  format: typeof AREA_ASSET_FORMAT;
  prefectures: readonly (readonly [string, string])[];
  municipalities: readonly (readonly [string, string])[];
  postalPrefixes: readonly string[];
}>;

export type AreaAssetTownRow = readonly [
  areaCode: string,
  municipalityCode: string,
  name: string,
  kana: string,
];

const byCodePoint = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

const townRowOrder = (a: AreaAssetTownRow, b: AreaAssetTownRow): number =>
  byCodePoint(a[1], b[1]) ||
  (a[2] === "" ? -1 : 0) - (b[2] === "" ? -1 : 0) ||
  byCodePoint(a[3], b[3]) ||
  byCodePoint(a[0], b[0]) ||
  byCodePoint(a[2], b[2]);

function groupRows(
  rows: readonly AreaAssetTownRow[],
  keyOf: (row: AreaAssetTownRow) => string,
): Map<string, AreaAssetTownRow[]> {
  const groups = new Map<string, AreaAssetTownRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [row]);
    else group.push(row);
  }
  for (const group of groups.values()) group.sort(townRowOrder);
  return groups;
}

/**
 * Splits master rows into the asset files, keyed by their path under the
 * base path. Throws when the rows break the master's invariants (a code in
 * the wrong format, a municipality outside its prefecture, two names for
 * one code, the same town twice, two whole-municipality towns in one
 * municipality) — the importer must have resolved those already.
 */
export function buildAreaAssets(
  rows: readonly AreaMasterRow[],
): ReadonlyMap<string, unknown> {
  const prefectures = new Map<string, string>();
  const municipalities = new Map<string, string>();
  const townKeys = new Set<string>();
  const wholeTowns = new Set<string>();
  const townRows: AreaAssetTownRow[] = [];

  const sameName = (
    names: Map<string, string>,
    code: string,
    name: string,
  ): void => {
    const known = names.get(code);
    if (known !== undefined && known !== name) {
      throw new Error(`Code ${code} has two names: ${known} and ${name}`);
    }
    names.set(code, name);
  };

  for (const row of rows) {
    const areaCode = AreaCode.create(row.areaCode);
    const prefectureCode = PrefectureCode.create(row.prefectureCode);
    const municipalityCode = MunicipalityCode.create(row.municipalityCode);
    if (MunicipalityCode.prefectureOf(municipalityCode) !== prefectureCode) {
      throw new Error(
        `Municipality ${municipalityCode} is not in prefecture ${prefectureCode}`,
      );
    }
    sameName(prefectures, prefectureCode, row.prefectureName);
    sameName(municipalities, municipalityCode, row.municipalityName);
    const key = `${areaCode}\u0000${municipalityCode}\u0000${row.name}`;
    if (townKeys.has(key)) {
      throw new Error(
        `Town ${areaCode} ${municipalityCode} "${row.name}" appears twice`,
      );
    }
    townKeys.add(key);
    if (row.name === "") {
      if (wholeTowns.has(municipalityCode)) {
        throw new Error(
          `Municipality ${municipalityCode} has two whole-municipality towns`,
        );
      }
      wholeTowns.add(municipalityCode);
    }
    townRows.push([areaCode, municipalityCode, row.name, row.kana]);
  }

  const byPrefecture = groupRows(townRows, (row) => row[1].slice(0, 2));
  const byPostalPrefix = groupRows(townRows, (row) =>
    AreaAssetPath.postalPrefixOf(row[0]),
  );
  const sortedEntries = (
    names: Map<string, string>,
  ): (readonly [string, string])[] =>
    [...names.entries()].sort((a, b) => byCodePoint(a[0], b[0]));

  const index: AreaAssetIndex = {
    format: AREA_ASSET_FORMAT,
    prefectures: sortedEntries(prefectures),
    municipalities: sortedEntries(municipalities),
    postalPrefixes: [...byPostalPrefix.keys()].sort(byCodePoint),
  };
  const files = new Map<string, unknown>([[AreaAssetPath.index, index]]);
  for (const [prefectureCode, group] of [...byPrefecture].sort((a, b) =>
    byCodePoint(a[0], b[0]),
  )) {
    files.set(AreaAssetPath.towns(prefectureCode), group);
  }
  for (const [prefix, group] of [...byPostalPrefix].sort((a, b) =>
    byCodePoint(a[0], b[0]),
  )) {
    files.set(AreaAssetPath.postal(prefix), group);
  }
  return files;
}
