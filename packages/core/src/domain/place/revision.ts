import { Address } from "@repo/core/domain/common/address";
import {
  FieldPatch,
  type FieldPatchSchema,
} from "@repo/core/domain/common/fieldPatch";
import { GeoPoint } from "@repo/core/domain/common/geo";
import type { PhotoSet } from "@repo/core/domain/common/photoSet";
import { RevisedPhotos } from "@repo/core/domain/common/revisedPhotos";
import { OperatingStatus } from "./operatingStatus";
import type {
  BusinessHours,
  ContactInfo,
  PlaceDescription,
  PlaceName,
  PlacePhoto,
  PlaceProfile,
} from "./profile";

/** One changed item of a place revision, in definition order. */
export type PlaceChange =
  | Readonly<{ field: "name"; value: PlaceName }>
  | Readonly<{ field: "photos"; value: RevisedPhotos<PlacePhoto> }>
  | Readonly<{ field: "description"; value: PlaceDescription | null }>
  | Readonly<{ field: "address"; value: Address }>
  | Readonly<{ field: "location"; value: GeoPoint }>
  | Readonly<{ field: "businessHours"; value: BusinessHours | null }>
  | Readonly<{ field: "contact"; value: ContactInfo | null }>
  | Readonly<{ field: "operatingStatus"; value: OperatingStatus }>;

export type PlaceChangeField = PlaceChange["field"];

/** What a revision reads and overlays; a `Place` satisfies it. */
export type PlaceState = Readonly<{
  profile: PlaceProfile;
  operatingStatus: OperatingStatus;
}>;

/** 情報修正: only the items that change (`FieldPatch`). */
export type PlaceRevision = FieldPatch<PlaceChange>;

/** Present value of each field: the photo set for photos, the change value otherwise. */
export type PlaceCurrentValues = {
  name: PlaceName;
  photos: PhotoSet<PlacePhoto>;
  description: PlaceDescription | null;
  address: Address;
  location: GeoPoint;
  businessHours: BusinessHours | null;
  contact: ContactInfo | null;
  operatingStatus: OperatingStatus;
};

const withProfile = (
  state: PlaceState,
  change: Partial<PlaceProfile>,
): PlaceState => ({ ...state, profile: { ...state.profile, ...change } });

const same = <T>(a: T, b: T): boolean => a === b;
const keep = <T>(_current: T, desired: T): T => desired;

const sameOrder = (a: PhotoSet<PlacePhoto>, b: PhotoSet<PlacePhoto>): boolean =>
  a.items.length === b.items.length &&
  a.items.every((item, i) => item.photoId === b.items[i]?.photoId);

const schema: FieldPatchSchema<PlaceState, PlaceChange, PlaceCurrentValues> = {
  order: [
    "name",
    "photos",
    "description",
    "address",
    "location",
    "businessHours",
    "contact",
    "operatingStatus",
  ],
  photoField: "photos",
  fields: {
    name: {
      read: (s) => s.profile.name,
      equals: same,
      propose: keep,
      overlay: (s, name) => withProfile(s, { name }),
    },
    photos: {
      read: (s) => s.profile.photos,
      equals: sameOrder,
      propose: RevisedPhotos.between,
      overlay: (s, revised) =>
        withProfile(s, {
          photos: RevisedPhotos.overlay(s.profile.photos, revised),
        }),
    },
    description: {
      read: (s) => s.profile.description,
      equals: same,
      propose: keep,
      overlay: (s, description) => withProfile(s, { description }),
    },
    address: {
      read: (s) => s.profile.address,
      equals: Address.equals,
      propose: keep,
      overlay: (s, address) => withProfile(s, { address }),
    },
    location: {
      read: (s) => s.profile.location,
      equals: GeoPoint.equals,
      propose: keep,
      overlay: (s, location) => withProfile(s, { location }),
    },
    businessHours: {
      read: (s) => s.profile.visitInfo.businessHours,
      equals: same,
      propose: keep,
      overlay: (s, businessHours) =>
        withProfile(s, {
          visitInfo: { ...s.profile.visitInfo, businessHours },
        }),
    },
    contact: {
      read: (s) => s.profile.visitInfo.contact,
      equals: same,
      propose: keep,
      overlay: (s, contact) =>
        withProfile(s, { visitInfo: { ...s.profile.visitInfo, contact } }),
    },
    operatingStatus: {
      read: (s) => s.operatingStatus,
      equals: OperatingStatus.equals,
      propose: keep,
      overlay: (s, operatingStatus) => ({ ...s, operatingStatus }),
    },
  },
};

export const PlaceRevision = {
  /**
   * How each item is read, compared (photos by `PhotoId` order) and
   * overlaid. Use it with `FieldPatch.between` / `preview` / `compare` /
   * `addedPhotoIds`.
   */
  schema,

  /** `FieldPatch.between(schema, current, desired)`; `COMMON_INVALID_FIELD_PATCH` when nothing differs. */
  between: (current: PlaceState, desired: PlaceState): PlaceRevision =>
    FieldPatch.between(schema, current, desired),

  /** `current` with every item of `revision` overlaid. */
  preview: (current: PlaceState, revision: PlaceRevision): PlaceState =>
    FieldPatch.preview(schema, current, revision),
};
