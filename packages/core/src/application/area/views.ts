import type {
  MunicipalityCode,
  PrefectureCode,
} from "@repo/core/domain/area/codes";
import { Town } from "@repo/core/domain/area/town";
import type { AreaCode } from "@repo/core/domain/common/areaCode";

/**
 * A town as the screens show it. Its `areaCode`, `municipalityCode` and
 * `name` are the `TownRef` that picks it; `areaCode` alone is the area
 * selection it belongs to.
 */
export type TownView = Readonly<{
  areaCode: AreaCode;
  prefectureCode: PrefectureCode;
  prefectureName: string;
  municipalityCode: MunicipalityCode;
  municipalityName: string;
  /** Empty for the town that stands for the whole municipality. */
  name: string;
  /** Postal code and place name (`Town.label`), e.g. `100-0005 東京都千代田区丸の内`. */
  label: string;
}>;

export const toTownView = (town: Town): TownView => ({
  areaCode: town.areaCode,
  prefectureCode: town.prefecture.code,
  prefectureName: town.prefecture.name,
  municipalityCode: town.municipality.code,
  municipalityName: town.municipality.name,
  name: town.name,
  label: Town.label(town),
});
