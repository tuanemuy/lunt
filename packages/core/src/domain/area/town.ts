import { Address } from "@repo/core/domain/common/address";
import type { AreaCode } from "@repo/core/domain/common/areaCode";
import type { MunicipalityCode, PrefectureCode } from "./codes";
import { PostalCode } from "./postalCode";

/** The first level of the hierarchy. Only `AreaCatalog` produces one. */
export type Prefecture = Readonly<{ code: PrefectureCode; name: string }>;

/** The second level; belongs to exactly one prefecture. */
export type Municipality = Readonly<{
  code: MunicipalityCode;
  prefectureCode: PrefectureCode;
  name: string;
}>;

/**
 * The third level: a place name under one municipality with the postal code
 * of its area. Several towns may share one `AreaCode`. A town with an empty
 * `name` stands for the whole municipality (at most one per municipality).
 * Only `AreaCatalog` produces one — never built from user input.
 */
export type Town = Readonly<{
  areaCode: AreaCode;
  prefecture: Prefecture;
  municipality: Municipality;
  name: string;
  /** Reading of `name`; sorts towns. Empty for the whole-municipality town. */
  kana: string;
}>;

const byCodePoint = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

export const Town = {
  equals: (a: Town, b: Town): boolean =>
    a.areaCode === b.areaCode &&
    a.municipality.code === b.municipality.code &&
    a.name === b.name,

  /**
   * The order `AreaCatalog.listTowns` returns: the whole-municipality town
   * first, then `kana`, `areaCode`, `name` ascending by code point.
   */
  compare: (a: Town, b: Town): number => {
    const aWhole = a.name === "";
    const bWhole = b.name === "";
    if (aWhole !== bWhole) return aWhole ? -1 : 1;
    return (
      byCodePoint(a.kana, b.kana) ||
      byCodePoint(a.areaCode, b.areaCode) ||
      byCodePoint(a.name, b.name)
    );
  },

  /** Prefecture, municipality and town names joined, e.g. `東京都千代田区丸の内`. */
  placeName: (town: Town): string =>
    `${town.prefecture.name}${town.municipality.name}${town.name}`,

  /** Postal code and place name, e.g. `100-0005 東京都千代田区丸の内`. */
  label: (town: Town): string =>
    `${PostalCode.format(town.areaCode)} ${Town.placeName(town)}`,

  /**
   * The only way to build an `Address` from fresh input, so an address
   * always carries an `AreaCode` the master has. `rest` (the part after
   * the town) is trimmed and may be empty.
   */
  toAddress: (town: Town, rest: string): Address =>
    Address.of(
      {
        areaCode: town.areaCode,
        prefecture: town.prefecture.name,
        municipality: town.municipality.name,
        town: town.name,
      },
      rest,
    ),
};
