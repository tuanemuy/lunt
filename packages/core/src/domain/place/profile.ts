import { Address } from "@repo/core/domain/common/address";
import { GeoPoint } from "@repo/core/domain/common/geo";
import type { PhotoId } from "@repo/core/domain/common/ids";
import { LineBreak } from "@repo/core/domain/common/lineBreak";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { BusinessRuleError } from "@repo/core/domain/error";
import { PlaceErrorCode } from "./errorCode";

declare const placeNameBrand: unique symbol;
declare const placeDescriptionBrand: unique symbol;
declare const businessHoursBrand: unique symbol;
declare const contactInfoBrand: unique symbol;

export type PlaceName = string & { readonly [placeNameBrand]: true };
export type PlaceDescription = string & {
  readonly [placeDescriptionBrand]: true;
};
export type BusinessHours = string & { readonly [businessHoursBrand]: true };
export type ContactInfo = string & { readonly [contactInfoBrand]: true };

/**
 * A free-text value: trimmed, never empty; with `oneLine`, without a line
 * break (`LineBreak`). Optional fields hold `null` rather than an empty
 * string.
 */
const text = <T extends string>(
  code: PlaceErrorCode,
  label: string,
  oneLine = false,
) => ({
  /** Trims; throws `code` when nothing is left, or at a line break when `oneLine`. */
  create: (input: string): T => {
    const value = input.trim();
    if (value.length === 0) {
      throw new BusinessRuleError(code, `${label} must not be empty`);
    }
    if (oneLine && LineBreak.contains(value)) {
      throw new BusinessRuleError(code, `${label} must be one line`);
    }
    return value as T;
  },
  /** `null` for `null` or a blank string, `create` otherwise. */
  optional: (input: string | null): T | null => {
    if (input === null || input.trim().length === 0) return null;
    return input.trim() as T;
  },
  equals: (a: T, b: T): boolean => a === b,
});

/** Trimmed, non-empty, one line (`PLACE_INVALID_NAME`). */
export const PlaceName = text<PlaceName>(
  PlaceErrorCode.InvalidName,
  "Name",
  true,
);
export const PlaceDescription = text<PlaceDescription>(
  PlaceErrorCode.InvalidDescription,
  "Description",
);
export const BusinessHours = text<BusinessHours>(
  PlaceErrorCode.InvalidBusinessHours,
  "Business hours",
);
export const ContactInfo = text<ContactInfo>(
  PlaceErrorCode.InvalidContactInfo,
  "Contact info",
);

/** What a visitor needs: business hours and contact, each optional. */
export type VisitInfo = Readonly<{
  businessHours: BusinessHours | null;
  contact: ContactInfo | null;
}>;

export const VisitInfo = {
  equals: (a: VisitInfo, b: VisitInfo): boolean =>
    a.businessHours === b.businessHours && a.contact === b.contact,
};

export type PlacePhoto = Readonly<{ photoId: PhotoId }>;

/**
 * A place's content. The publish conditions — name, address, location —
 * are required fields, so content lacking one cannot be built.
 */
export type PlaceProfile = Readonly<{
  name: PlaceName;
  photos: PhotoSet<PlacePhoto>;
  description: PlaceDescription | null;
  address: Address;
  location: GeoPoint;
  visitInfo: VisitInfo;
}>;

export type PlaceProfileInput = Readonly<{
  name: string;
  photoIds: readonly PhotoId[];
  description: string | null;
  /** From Area's `Town.toAddress`. */
  address: Address;
  location: Readonly<{ latitude: number; longitude: number }>;
  businessHours: string | null;
  contact: string | null;
}>;

const samePhotoOrder = (
  a: PhotoSet<PlacePhoto>,
  b: PhotoSet<PlacePhoto>,
): boolean =>
  a.items.length === b.items.length &&
  a.items.every((item, i) => item.photoId === b.items[i]?.photoId);

export const PlaceProfile = {
  /**
   * Builds every value object: `PLACE_INVALID_NAME` for a blank name,
   * `COMMON_INVALID_GEO_POINT` for coordinates out of range,
   * `PLACE_DUPLICATE_PHOTO` for a repeated `PhotoId`. Blank optional texts
   * become `null`.
   */
  create: (input: PlaceProfileInput): PlaceProfile => ({
    name: PlaceName.create(input.name),
    photos: PhotoSet.of(
      input.photoIds.map((photoId) => ({ photoId })),
      "PLACE",
    ),
    description: PlaceDescription.optional(input.description),
    address: input.address,
    location: GeoPoint.create(
      input.location.latitude,
      input.location.longitude,
    ),
    visitInfo: {
      businessHours: BusinessHours.optional(input.businessHours),
      contact: ContactInfo.optional(input.contact),
    },
  }),

  /**
   * Every field equal; photos compare their `PhotoId` sequence, order
   * included, and ignore `takenDown`.
   */
  equals: (a: PlaceProfile, b: PlaceProfile): boolean =>
    a.name === b.name &&
    samePhotoOrder(a.photos, b.photos) &&
    a.description === b.description &&
    Address.equals(a.address, b.address) &&
    GeoPoint.equals(a.location, b.location) &&
    VisitInfo.equals(a.visitInfo, b.visitInfo),

  /** The first photo, or `null` without photos. */
  cover: (profile: PlaceProfile): PhotoId | null =>
    profile.photos.items[0]?.photoId ?? null,
};
