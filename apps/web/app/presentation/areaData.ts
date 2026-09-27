// Server-only: import from server-function handlers (dynamically) or
// server-only loaders, never from components.
import { browseAreaHierarchy } from "@repo/core/application/area/browseAreaHierarchy";
import { findTownsByPostalCode } from "@repo/core/application/area/findTownsByPostalCode";
import type { TownView } from "@repo/core/application/area/views";
import type { RequestContainer } from "@repo/core/application/di/types";
import type { Address } from "@repo/core/domain/common/address";
import { classifyError } from "./errorState";
import type { AreaLists, AreaOption, TownOption } from "./placeView";

export const toTownOption = (town: TownView): TownOption => ({
  areaCode: town.areaCode,
  prefectureCode: town.prefectureCode,
  prefectureName: town.prefectureName,
  municipalityCode: town.municipalityCode,
  municipalityName: town.municipalityName,
  name: town.name,
  label: town.label,
});

/**
 * The town an address was saved with. An address keeps the town's names
 * but not its municipality code, so the town is found again among its
 * postal code's towns; `null` when the master no longer has it (the user
 * then picks it again).
 */
export async function townOfAddress(
  container: RequestContainer,
  address: Address,
): Promise<TownOption | null> {
  try {
    const towns = await findTownsByPostalCode({
      container,
      input: { postalCode: address.areaCode },
    });
    const town = towns.find(
      (candidate) =>
        candidate.prefectureName === address.prefecture &&
        candidate.municipalityName === address.municipality &&
        candidate.name === address.town,
    );
    return town === undefined ? null : toTownOption(town);
  } catch (error) {
    if (classifyError(error).kind === "invalidInput") return null;
    throw error;
  }
}

/** The prefectures, and the municipalities and towns around `town` when one is picked. */
export async function loadAreaLists(
  container: RequestContainer,
  town: TownOption | null,
): Promise<AreaLists> {
  const [prefectures, municipalities, towns] = await Promise.all([
    browseAreaHierarchy({ container, input: { level: "prefectures" } }),
    town === null
      ? null
      : browseAreaHierarchy({
          container,
          input: {
            level: "municipalities",
            prefectureCode: town.prefectureCode,
          },
        }),
    town === null
      ? null
      : browseAreaHierarchy({
          container,
          input: { level: "towns", municipalityCode: town.municipalityCode },
        }),
  ]);
  const options = (
    items: readonly Readonly<{ code: string; name: string }>[],
  ): readonly AreaOption[] => items.map(({ code, name }) => ({ code, name }));
  return {
    prefectures:
      prefectures.level === "prefectures"
        ? options(prefectures.prefectures)
        : [],
    municipalities:
      municipalities?.level === "municipalities"
        ? options(municipalities.municipalities)
        : [],
    towns: towns?.level === "towns" ? towns.towns.map(toTownOption) : [],
  };
}
