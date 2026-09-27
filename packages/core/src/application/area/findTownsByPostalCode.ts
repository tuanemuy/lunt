import { AreaErrorCode } from "@repo/core/domain/area/errorCode";
import { PostalCode } from "@repo/core/domain/area/postalCode";
import { BusinessRuleError } from "@repo/core/domain/error";
import type { ServiceArgs } from "../types";
import { type TownView, toTownView } from "./views";

export type FindTownsByPostalCodeInput = Readonly<{ postalCode: string }>;

/**
 * The town candidates of a typed postal code, in `AreaCatalog.listTowns`
 * order (SHP-03/06/08/12/13, REG-06/12, EVT-04/12; CF-07). The input may
 * hold full-width digits, hyphens and spaces. No actor.
 *
 * Errors: `AREA_INVALID_POSTAL_CODE` when it is not 7 digits;
 * `AREA_TOWN_NOT_FOUND` when no town has it (business-specific codes
 * included) — the user picks the town from the hierarchy instead.
 */
export async function findTownsByPostalCode({
  container,
  input,
}: ServiceArgs<FindTownsByPostalCodeInput>): Promise<readonly TownView[]> {
  const postalCode = PostalCode.create(input.postalCode);
  const towns = await container.areaCatalog.findTownsByPostalCode(postalCode);
  if (towns.length === 0) {
    throw new BusinessRuleError(
      AreaErrorCode.TownNotFound,
      "No town has this postal code",
    );
  }
  return towns.map(toTownView);
}
