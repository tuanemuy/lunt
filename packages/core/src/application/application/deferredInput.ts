import { AreaErrorCode } from "@repo/core/domain/area/errorCode";
import { Town } from "@repo/core/domain/area/town";
import { BusinessRuleError } from "@repo/core/domain/error";
import { PlaceProfile } from "@repo/core/domain/place/profile";
import type { RequestContainer } from "../di/types";
import type { PlaceProfileFields } from "../place/profileInput";

/**
 * A value built from input alone, whose `BusinessRuleError` is held back
 * until the usecase reaches 「内容の値」 in its order of checks
 * (`spec/usecases/application.md` 「提出のユースケースに共通すること」,
 * 「resubmitApplication」): calling it builds the value or throws.
 */
export type Deferred<T> = () => T;

/** Builds now; a `BusinessRuleError` is rethrown only when the result is called. */
export function defer<T>(build: () => T): Deferred<T> {
  try {
    const value = build();
    return () => value;
  } catch (error) {
    if (!(error instanceof BusinessRuleError)) throw error;
    return () => {
      throw error;
    };
  }
}

/**
 * The value, or `null` when the input does not make one — for the
 * idempotent-create comparison, where an input that cannot be built never
 * equals a stored (valid) application.
 */
export function peek<T>(value: Deferred<T>): T | null {
  try {
    return value();
  } catch (error) {
    if (error instanceof BusinessRuleError) return null;
    throw error;
  }
}

/**
 * The place profile of `fields`: the town is looked up now
 * (`AreaCatalog.findTown`, before the unit of work); `AREA_TOWN_NOT_FOUND`
 * and `PlaceProfile.create`'s codes are held back like any `Deferred`.
 */
export async function deferProfile(
  container: Pick<RequestContainer, "areaCatalog">,
  fields: PlaceProfileFields,
): Promise<Deferred<PlaceProfile>> {
  const town = await container.areaCatalog.findTown(fields.town);
  return defer(() => {
    if (town === null) {
      throw new BusinessRuleError(
        AreaErrorCode.TownNotFound,
        "The chosen town is not in the area master",
      );
    }
    return PlaceProfile.create({
      name: fields.name,
      photoIds: fields.photoIds,
      description: fields.description,
      address: Town.toAddress(town, fields.addressRest),
      location: fields.location,
      businessHours: fields.businessHours,
      contact: fields.contact,
    });
  });
}
