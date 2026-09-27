import { MunicipalityCode, PrefectureCode } from "@repo/core/domain/area/codes";
import type { Municipality, Prefecture } from "@repo/core/domain/area/town";
import type { ServiceArgs } from "../types";
import { type TownView, toTownView } from "./views";

export type BrowseAreaHierarchyInput =
  | Readonly<{ level: "prefectures" }>
  | Readonly<{ level: "municipalities"; prefectureCode: string }>
  | Readonly<{ level: "towns"; municipalityCode: string }>;

export type BrowseAreaHierarchyOutput =
  | Readonly<{ level: "prefectures"; prefectures: readonly Prefecture[] }>
  | Readonly<{
      level: "municipalities";
      municipalities: readonly Municipality[];
    }>
  | Readonly<{ level: "towns"; towns: readonly TownView[] }>;

/**
 * One level of the area hierarchy (DIS-03, DIS-04, SHP-03/06/08/12/13,
 * REG-06/12, EVT-04/12; VW-02, CF-07): every prefecture, a prefecture's
 * municipalities, or a municipality's towns (the whole-municipality town
 * included), in `AreaCatalog` order. Codes the master lacks give an empty
 * list. No actor — works logged out.
 *
 * Errors: `AREA_INVALID_PREFECTURE_CODE` / `AREA_INVALID_MUNICIPALITY_CODE`
 * for a code in the wrong format.
 */
export async function browseAreaHierarchy({
  container,
  input,
}: ServiceArgs<BrowseAreaHierarchyInput>): Promise<BrowseAreaHierarchyOutput> {
  switch (input.level) {
    case "prefectures":
      return {
        level: "prefectures",
        prefectures: await container.areaCatalog.listPrefectures(),
      };
    case "municipalities":
      return {
        level: "municipalities",
        municipalities: await container.areaCatalog.listMunicipalities(
          PrefectureCode.create(input.prefectureCode),
        ),
      };
    case "towns": {
      const towns = await container.areaCatalog.listTowns(
        MunicipalityCode.create(input.municipalityCode),
      );
      return { level: "towns", towns: towns.map(toTownView) };
    }
  }
}
