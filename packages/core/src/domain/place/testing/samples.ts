import { Address } from "@repo/core/domain/common/address";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import { PhotoId, PlaceId } from "@repo/core/domain/common/ids";
import { Place } from "../place";
import { PlaceProfile, type PlaceProfileInput } from "../profile";

/**
 * Sample addresses of `spec/testcases/ports/placeRepository.md`
 * 「テスト用の店舗」, built with `Address.of` the way a stored address is
 * rehydrated (fresh input goes through Area's `Town.toAddress`).
 */
export const SampleAddress = {
  otemachi: (rest = "1-1"): Address =>
    Address.of(
      {
        areaCode: AreaCode.create("1000004"),
        prefecture: "東京都",
        municipality: "千代田区",
        town: "大手町",
      },
      rest,
    ),
  ginza: (rest = "2-2"): Address =>
    Address.of(
      {
        areaCode: AreaCode.create("1040061"),
        prefecture: "東京都",
        municipality: "中央区",
        town: "銀座",
      },
      rest,
    ),
  umeda: (rest = "3-3"): Address =>
    Address.of(
      {
        areaCode: AreaCode.create("5300001"),
        prefecture: "大阪府",
        municipality: "大阪市北区",
        town: "梅田",
      },
      rest,
    ),
  chiyoda: (rest = "5-5"): Address =>
    Address.of(
      {
        areaCode: AreaCode.create("1000001"),
        prefecture: "東京都",
        municipality: "千代田区",
        town: "千代田",
      },
      rest,
    ),
};

export const samplePhotoId = (n: number): PhotoId =>
  PhotoId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);

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
