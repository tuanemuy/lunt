import type { AreaCode } from "@repo/core/domain/common/areaCode";
import type { AreaSelection, AreaSelectionLabel } from "../areaSelection";
import type { MunicipalityCode, PrefectureCode } from "../codes";
import type { PostalCode } from "../postalCode";
import type { Municipality, Prefecture, Town } from "../town";
import type { TownRef } from "../townRef";

/**
 * The read-only area master (`spec/domains/area.md` 「AreaCatalog」): the
 * prefecture → municipality → town hierarchy of the towns' postal codes
 * (business-specific postal codes are not in it).
 *
 * - Read-only; never joins a unit of work. Its content is fixed when the
 *   adapter is built and does not change within a request.
 * - Every town maps to exactly one municipality and one `AreaCode`; every
 *   municipality to one prefecture. Municipalities and prefectures without
 *   towns do not appear.
 * - Unknown codes give empty results (`null` for `findTown`), never errors.
 * - No paging: every result is bounded by one level of the hierarchy.
 *
 * Orders:
 * - `listPrefectures`, `listMunicipalities`: `code` ascending.
 * - `listTowns`, `findTownsByPostalCode`: `Town.compare` — the
 *   whole-municipality town (empty `name`) first, then `kana`, `areaCode`,
 *   `name` ascending by code point.
 * - `labelSelections`: the argument order, selections of codes the master
 *   lacks left out (no de-duplication).
 *
 * `expand` unions: a prefecture → every town's `AreaCode` in it, a
 * municipality → every town's `AreaCode` in it, an area → itself when the
 * master has it. `[]` → the empty set.
 */
export interface AreaCatalog {
  listPrefectures(): Promise<readonly Prefecture[]>;
  listMunicipalities(
    prefectureCode: PrefectureCode,
  ): Promise<readonly Municipality[]>;
  listTowns(municipalityCode: MunicipalityCode): Promise<readonly Town[]>;
  findTownsByPostalCode(postalCode: PostalCode): Promise<readonly Town[]>;
  findTown(ref: TownRef): Promise<Town | null>;
  expand(selections: readonly AreaSelection[]): Promise<ReadonlySet<AreaCode>>;
  labelSelections(
    selections: readonly AreaSelection[],
  ): Promise<readonly AreaSelectionLabel[]>;
}
