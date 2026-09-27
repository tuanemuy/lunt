import { AreaCode } from "@repo/core/domain/common/areaCode";
import { MunicipalityCode, PrefectureCode } from "./codes";
import type { Municipality, Prefecture } from "./town";
import { Town } from "./town";

/**
 * A choice of a prefecture, a municipality or one area. Choosing a
 * prefecture or municipality chooses every area in it (P-13); several
 * choices mean the union. An empty list means "no area condition" — the
 * caller (Discovery) tells that apart, it is never expanded.
 */
export type AreaSelection =
  | Readonly<{ unit: "prefecture"; prefectureCode: PrefectureCode }>
  | Readonly<{ unit: "municipality"; municipalityCode: MunicipalityCode }>
  | Readonly<{ unit: "area"; areaCode: AreaCode }>;

/** A selection as it arrives from the transport, before validation. */
export type AreaSelectionInput =
  | Readonly<{ unit: "prefecture"; prefectureCode: string }>
  | Readonly<{ unit: "municipality"; municipalityCode: string }>
  | Readonly<{ unit: "area"; areaCode: string }>;

/** A selection and the name the screen shows for it. */
export type AreaSelectionLabel = Readonly<{
  selection: AreaSelection;
  label: string;
}>;

const codeOf = (selection: AreaSelection): string => {
  switch (selection.unit) {
    case "prefecture":
      return selection.prefectureCode;
    case "municipality":
      return selection.municipalityCode;
    case "area":
      return selection.areaCode;
  }
};

const keyOf = (selection: AreaSelection): string =>
  `${selection.unit}:${codeOf(selection)}`;

export const AreaSelection = {
  create: (input: AreaSelectionInput): AreaSelection => {
    switch (input.unit) {
      case "prefecture":
        return {
          unit: "prefecture",
          prefectureCode: PrefectureCode.create(input.prefectureCode),
        };
      case "municipality":
        return {
          unit: "municipality",
          municipalityCode: MunicipalityCode.create(input.municipalityCode),
        };
      case "area":
        return { unit: "area", areaCode: AreaCode.create(input.areaCode) };
    }
  },

  prefecture: (code: PrefectureCode): AreaSelection => ({
    unit: "prefecture",
    prefectureCode: code,
  }),

  municipality: (code: MunicipalityCode): AreaSelection => ({
    unit: "municipality",
    municipalityCode: code,
  }),

  area: (code: AreaCode): AreaSelection => ({ unit: "area", areaCode: code }),

  equals: (a: AreaSelection, b: AreaSelection): boolean =>
    keyOf(a) === keyOf(b),

  /** Drops selections equal to an earlier one; first occurrences keep their order. */
  dedupe: (selections: readonly AreaSelection[]): readonly AreaSelection[] => {
    const seen = new Set<string>();
    const result: AreaSelection[] = [];
    for (const selection of selections) {
      const key = keyOf(selection);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(selection);
    }
    return result;
  },
};

export const AreaSelectionLabel = {
  /** The prefecture's name, e.g. `東京都`. */
  ofPrefecture: (
    selection: AreaSelection,
    prefecture: Prefecture,
  ): AreaSelectionLabel => ({ selection, label: prefecture.name }),

  /** Prefecture and municipality names, e.g. `東京都千代田区`. */
  ofMunicipality: (
    selection: AreaSelection,
    prefecture: Prefecture,
    municipality: Municipality,
  ): AreaSelectionLabel => ({
    selection,
    label: `${prefecture.name}${municipality.name}`,
  }),

  /**
   * The postal code and place name of the area's first town in
   * `listTowns` order (`Town.label`).
   */
  ofArea: (selection: AreaSelection, firstTown: Town): AreaSelectionLabel => ({
    selection,
    label: Town.label(firstTown),
  }),
};
