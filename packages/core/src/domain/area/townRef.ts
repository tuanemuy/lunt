import { AreaCode } from "@repo/core/domain/common/areaCode";
import { MunicipalityCode } from "./codes";
import type { Town } from "./town";

/**
 * The town a user picked: the three values that identify a `Town`. It
 * becomes an address only once `AreaCatalog.findTown` resolves it; an
 * unresolvable one is `AREA_TOWN_NOT_FOUND`.
 */
export type TownRef = Readonly<{
  areaCode: AreaCode;
  municipalityCode: MunicipalityCode;
  name: string;
}>;

export const TownRef = {
  /** From transport input: the codes go through their value objects. */
  create: (input: {
    areaCode: string;
    municipalityCode: string;
    name: string;
  }): TownRef => ({
    areaCode: AreaCode.create(input.areaCode),
    municipalityCode: MunicipalityCode.create(input.municipalityCode),
    name: input.name,
  }),

  of: (town: Town): TownRef => ({
    areaCode: town.areaCode,
    municipalityCode: town.municipality.code,
    name: town.name,
  }),

  matches: (ref: TownRef, town: Town): boolean =>
    ref.areaCode === town.areaCode &&
    ref.municipalityCode === town.municipality.code &&
    ref.name === town.name,
};
