import type { TownRef } from "@repo/core/domain/area/townRef";
import type { PhotoId } from "@repo/core/domain/common/ids";
import { PlaceProfile } from "@repo/core/domain/place/profile";
import { resolveAddress } from "../area/resolveAddress";
import type { RequestContainer } from "../di/types";

/**
 * A place's whole profile as entered: the address is the picked town plus
 * the part after it. Name, address and location are required; photos,
 * description, business hours and contact are optional (blank = none).
 */
export type PlaceProfileFields = Readonly<{
  name: string;
  /** Display order; the first is the cover. */
  photoIds: readonly PhotoId[];
  description: string | null;
  town: TownRef;
  /** The part of the address after the town; may be empty. */
  addressRest: string;
  location: Readonly<{ latitude: number; longitude: number }>;
  businessHours: string | null;
  contact: string | null;
}>;

/**
 * Resolves the town (`AREA_TOWN_NOT_FOUND`) and builds the profile's value
 * objects (`PLACE_INVALID_NAME`, `PLACE_DUPLICATE_PHOTO`, …). Called before
 * the unit of work.
 */
export async function buildPlaceProfile(
  container: Pick<RequestContainer, "areaCatalog">,
  fields: PlaceProfileFields,
): Promise<PlaceProfile> {
  const address = await resolveAddress(
    container.areaCatalog,
    fields.town,
    fields.addressRest,
  );
  return PlaceProfile.create({
    name: fields.name,
    photoIds: fields.photoIds,
    description: fields.description,
    address,
    location: fields.location,
    businessHours: fields.businessHours,
    contact: fields.contact,
  });
}
