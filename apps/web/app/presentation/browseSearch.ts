import type { BrowseCriteriaInput } from "@repo/core/application/discovery/criteria";
import type { AreaSelectionInput } from "@repo/core/domain/area/areaSelection";
import { z } from "zod";

/**
 * The browse conditions (CF-03, VW-02) as the URL carries them, shared by
 * VW-01 `/`, VW-04 `/map`, VW-05 `/regions` and VW-02 `/filter`:
 *
 * - `area`: the chosen areas as comma-separated codes, the unit told by the
 *   code's length — a prefecture `13` (2 digits), a municipality `13101`
 *   (5), an area `1010001` (7). `?area=13101,1010001`.
 * - `cat`: the chosen category ids, comma-separated. `?cat=abc,def`.
 *
 * Absent means no condition of that kind. Put `browseSearchSchema` into a
 * route's `validateSearch` (spread it into a larger `z.object` when the
 * route has more parameters), read the conditions with `browseCriteriaOf`,
 * and build a changed URL with `browseSearchOf` / `withoutArea` /
 * `withoutCategory`. A hand-edited value never errors the route: malformed
 * or duplicated codes drop out, at most `BROWSE_CONDITION_LIMIT` of each
 * kind are kept.
 *
 * The router parses a bare `13101` as a JSON number, so each field also
 * accepts a number and reads it as its digits (a code with a leading zero
 * is not valid JSON and stays a string).
 */
export const BROWSE_CONDITION_LIMIT = 20;

const listParam = z
  .union([z.string().max(2048), z.number().int().nonnegative()])
  .transform((value) => String(value))
  .optional()
  .catch(undefined);

export const browseSearchSchema = z.object({
  area: listParam,
  cat: listParam,
});

/** The validated `area` / `cat` pair (either may be absent). */
export type BrowseSearch = Readonly<{
  area?: string | undefined;
  cat?: string | undefined;
}>;

const PREFECTURE = "(0[1-9]|[1-3][0-9]|4[0-7])";
const PREFECTURE_CODE = new RegExp(`^${PREFECTURE}$`);
const MUNICIPALITY_CODE = new RegExp(`^${PREFECTURE}[0-9]{3}$`);
const AREA_CODE = /^[0-9]{7}$/;
const CATEGORY_ID = /^[A-Za-z0-9_-]{1,64}$/;

const splitList = (value: string | undefined): readonly string[] =>
  value === undefined
    ? []
    : [
        ...new Set(
          value
            .split(",")
            .map((part) => part.trim())
            .filter((part) => part.length > 0),
        ),
      ];

/** The selection a code names, or `null` for a malformed code. */
export function areaSelectionOfCode(code: string): AreaSelectionInput | null {
  if (PREFECTURE_CODE.test(code)) {
    return { unit: "prefecture", prefectureCode: code };
  }
  if (MUNICIPALITY_CODE.test(code)) {
    return { unit: "municipality", municipalityCode: code };
  }
  if (AREA_CODE.test(code)) return { unit: "area", areaCode: code };
  return null;
}

/** The code a selection is carried as in `area`. */
export function areaCodeOf(selection: AreaSelectionInput): string {
  switch (selection.unit) {
    case "prefecture":
      return selection.prefectureCode;
    case "municipality":
      return selection.municipalityCode;
    case "area":
      return selection.areaCode;
  }
}

/** The chosen areas in URL order, malformed and repeated codes left out. */
export function areaSelectionsOf(
  search: BrowseSearch,
): readonly AreaSelectionInput[] {
  return splitList(search.area)
    .map(areaSelectionOfCode)
    .filter((selection) => selection !== null)
    .slice(0, BROWSE_CONDITION_LIMIT);
}

/** The chosen category ids in URL order, malformed and repeated ids left out. */
export function categoryIdsOf(search: BrowseSearch): readonly string[] {
  return splitList(search.cat)
    .filter((id) => CATEGORY_ID.test(id))
    .slice(0, BROWSE_CONDITION_LIMIT);
}

/** The conditions a usecase takes (`findRegions`, `readFeed`, …). */
export function browseCriteriaOf(search: BrowseSearch): BrowseCriteriaInput {
  return {
    areas: areaSelectionsOf(search),
    categoryIds: categoryIdsOf(search),
  };
}

/** Whether any area or category is chosen. */
export function hasBrowseConditions(search: BrowseSearch): boolean {
  return (
    areaSelectionsOf(search).length > 0 || categoryIdsOf(search).length > 0
  );
}

/** The URL fields of `criteria`; an empty kind is left out. */
export function browseSearchOf(criteria: BrowseCriteriaInput): BrowseSearch {
  const area = criteria.areas.map(areaCodeOf).join(",");
  const cat = criteria.categoryIds.join(",");
  return {
    ...(area === "" ? {} : { area }),
    ...(cat === "" ? {} : { cat }),
  };
}

/** `search` without the area carried as `code` (CF-03 の1つずつの解除). */
export function withoutArea(search: BrowseSearch, code: string): BrowseSearch {
  const criteria = browseCriteriaOf(search);
  return browseSearchOf({
    ...criteria,
    areas: criteria.areas.filter((selection) => areaCodeOf(selection) !== code),
  });
}

/** `search` without the category `id`. */
export function withoutCategory(
  search: BrowseSearch,
  id: string,
): BrowseSearch {
  const criteria = browseCriteriaOf(search);
  return browseSearchOf({
    ...criteria,
    categoryIds: criteria.categoryIds.filter((each) => each !== id),
  });
}

/** `search` without its area conditions (VW-05 CS-09 「エリアを解除」). */
export function withoutAreas(search: BrowseSearch): BrowseSearch {
  return browseSearchOf({ ...browseCriteriaOf(search), areas: [] });
}

/** A stable key of the conditions, e.g. to remount an island when they change. */
export function browseSearchKey(search: BrowseSearch): string {
  const { area, cat } = browseSearchOf(browseCriteriaOf(search));
  return `${area ?? ""}|${cat ?? ""}`;
}

/** The screen that opened VW-02 and gets the applied conditions back. */
export type FilterOrigin = "discover" | "map" | "regions";

/**
 * VW-02's URL for the screen `from` with its current conditions
 * (`.spec-implement/phases/P0.md` 付録: `/filter?from=…&area=…&cat=…`).
 */
export function filterHref(from: FilterOrigin, search: BrowseSearch): string {
  const { area, cat } = browseSearchOf(browseCriteriaOf(search));
  const params = new URLSearchParams({ from });
  if (area !== undefined) params.set("area", area);
  if (cat !== undefined) params.set("cat", cat);
  return `/filter?${params.toString()}`;
}

const areaSelectionInputSchema = z.discriminatedUnion("unit", [
  z.object({
    unit: z.literal("prefecture"),
    prefectureCode: z.string().max(8),
  }),
  z.object({
    unit: z.literal("municipality"),
    municipalityCode: z.string().max(8),
  }),
  z.object({ unit: z.literal("area"), areaCode: z.string().max(8) }),
]);

/**
 * `BrowseCriteriaInput` at a server function's transport boundary: shape
 * and size only — the codes' formats are the value objects'.
 */
export const browseCriteriaSchema = z.object({
  areas: z.array(areaSelectionInputSchema).max(BROWSE_CONDITION_LIMIT),
  categoryIds: z.array(z.string().min(1).max(64)).max(BROWSE_CONDITION_LIMIT),
});
