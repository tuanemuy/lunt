import { PlaceId } from "@repo/core/domain/common/ids";
import { SampleAddress } from "@repo/core/domain/common/testing/samples";
import { Place } from "../place";
import { PlaceProfile, type PlaceProfileInput } from "../profile";

export {
  SampleAddress,
  samplePhotoId,
} from "@repo/core/domain/common/testing/samples";

export const samplePlaceId = (n: number): PlaceId =>
  PlaceId.create(`00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`);

export function sampleProfile(
  overrides: Partial<PlaceProfileInput> = {},
): PlaceProfile {
  return PlaceProfile.create({
    name: "山田珈琲店",
    photoIds: [],
    description: null,
    address: SampleAddress.otemachi(),
    location: { latitude: 35.6848, longitude: 139.7639 },
    businessHours: null,
    contact: null,
    ...overrides,
  });
}

export const SAMPLE_NOW = new Date("2026-09-28T00:00:00.000Z");

export function samplePlace(
  id: PlaceId = samplePlaceId(1),
  overrides: Partial<PlaceProfileInput> = {},
  now: Date = SAMPLE_NOW,
): Place {
  return Place.register({ id, profile: sampleProfile(overrides) }, now).entity;
}
