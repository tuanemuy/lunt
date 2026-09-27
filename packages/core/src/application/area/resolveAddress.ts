import { AreaErrorCode } from "@repo/core/domain/area/errorCode";
import type { AreaCatalog } from "@repo/core/domain/area/ports/areaCatalog";
import { Town } from "@repo/core/domain/area/town";
import type { TownRef } from "@repo/core/domain/area/townRef";
import type { Address } from "@repo/core/domain/common/address";
import { BusinessRuleError } from "@repo/core/domain/error";

/**
 * The address of a picked town plus the part after it — what every
 * usecase writing a located aggregate (place, region, occasion, their
 * applications) calls before its unit of work (`spec/domains/area.md`
 * 「トランザクション境界」). `AREA_TOWN_NOT_FOUND` when the master has no
 * such town.
 */
export async function resolveAddress(
  areaCatalog: AreaCatalog,
  town: TownRef,
  rest: string,
): Promise<Address> {
  const found = await areaCatalog.findTown(town);
  if (found === null) {
    throw new BusinessRuleError(
      AreaErrorCode.TownNotFound,
      "The chosen town is not in the area master",
    );
  }
  return Town.toAddress(found, rest);
}
