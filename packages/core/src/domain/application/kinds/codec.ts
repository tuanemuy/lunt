import { Address } from "@repo/core/domain/common/address";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import { GeoPoint } from "@repo/core/domain/common/geo";
import {
  AccountId,
  CategoryId,
  PhotoId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import type {
  PhotoOrigin,
  RevisedPhoto,
  RevisedPhotos,
} from "@repo/core/domain/common/revisedPhotos";
import {
  ListingContent,
  type PublishableListingContent,
} from "@repo/core/domain/listing/content";
import {
  Offering,
  OfferingPeriod,
  OpenDates,
} from "@repo/core/domain/listing/offering";
import {
  type ListingChange,
  ListingPatch,
} from "@repo/core/domain/listing/patch";
import {
  Framing,
  ListingDescription,
  ListingName,
  type ListingPhoto,
} from "@repo/core/domain/listing/values";
import { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import {
  BusinessHours,
  ContactInfo,
  PlaceDescription,
  PlaceName,
  type PlacePhoto,
  type PlaceProfile,
} from "@repo/core/domain/place/profile";
import {
  type PlaceChange,
  PlaceRevision,
  type PlaceState,
} from "@repo/core/domain/place/revision";
import type {
  Applicant,
  IndividualApplicant,
  PlaceApplicant,
} from "../applicant";
import type { JsonValue } from "../kind";

/**
 * JSON codecs for the Place and Listing values an application's case
 * holds. Encoding keeps every field as primitives; decoding rebuilds each
 * value through its value object and throws on anything malformed or not
 * in the normalized form an encoding produces (the model turns a throw
 * into a `RehydrationError`).
 */

export type Json = Readonly<Record<string, JsonValue>>;

/** The `reserved` / `desired` / `facts` of a kind that has none. */
export type None = Readonly<Record<never, never>>;

export function object(value: JsonValue | undefined): Json {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object");
  }
  return value as Json;
}

export function text(value: JsonValue | undefined): string {
  if (typeof value !== "string") throw new Error("Expected a string");
  return value;
}

function nullableText(value: JsonValue | undefined): string | null {
  return value === null ? null : text(value);
}

function num(value: JsonValue | undefined): number {
  if (typeof value !== "number") throw new Error("Expected a number");
  return value;
}

function bool(value: JsonValue | undefined): boolean {
  if (typeof value !== "boolean") throw new Error("Expected a boolean");
  return value;
}

export function list(value: JsonValue | undefined): readonly JsonValue[] {
  if (!Array.isArray(value)) throw new Error("Expected an array");
  return value;
}

/** A stored text must already be in the form its value object makes. */
function normalized<T extends string>(
  create: (input: string) => T,
  stored: string,
): T {
  const value = create(stored);
  if (value !== stored) throw new Error("Stored text is not normalized");
  return value;
}

function optionalNormalized<T extends string>(
  create: (input: string) => T,
  stored: JsonValue | undefined,
): T | null {
  const raw = nullableText(stored);
  return raw === null ? null : normalized(create, raw);
}

export const json = (value: unknown): JsonValue =>
  JSON.parse(JSON.stringify(value)) as JsonValue;

export function individualOf(
  value: JsonValue | undefined,
): IndividualApplicant {
  const raw = object(value);
  if (raw.kind !== "individual") throw new Error("Not an individual applicant");
  return {
    kind: "individual",
    accountId: AccountId.create(text(raw.accountId)),
  };
}

/** An applicant of any kind: an individual, or a place its steward acts for. */
export function applicantOf(value: JsonValue | undefined): Applicant {
  const raw = object(value);
  if (raw.kind === "individual") return individualOf(raw);
  if (raw.kind === "place") {
    return { kind: "place", placeId: PlaceId.create(text(raw.placeId)) };
  }
  throw new Error("Unknown applicant");
}

/**
 * The applicant of an application about `placeId`: an individual, or that
 * place itself (`ApplicationTarget.byPlace` builds both from one id).
 */
export function applicantAbout(
  value: JsonValue | undefined,
  placeId: PlaceId,
): Applicant {
  const applicant = applicantOf(value);
  if (applicant.kind === "place" && applicant.placeId !== placeId) {
    throw new Error("A place applicant for another place");
  }
  return applicant;
}

/** The place's own applicant for `placeId` (only its steward files one). */
export function placeApplicantOf(
  value: JsonValue | undefined,
  placeId: PlaceId,
): PlaceApplicant {
  const applicant = applicantAbout(value, placeId);
  if (applicant.kind !== "place") throw new Error("Not a place applicant");
  return applicant;
}

export function targetOf(value: JsonValue | undefined, kind: string): Json {
  const raw = object(value);
  if (raw.kind !== kind) throw new Error(`Not a ${kind} target`);
  return raw;
}

// --- Place --------------------------------------------------------------

function addressOf(value: JsonValue | undefined): Address {
  const raw = object(value);
  const rest = text(raw.rest);
  if (rest !== rest.trim()) throw new Error("Address rest is not trimmed");
  return Address.of(
    {
      areaCode: AreaCode.create(text(raw.areaCode)),
      prefecture: text(raw.prefecture),
      municipality: text(raw.municipality),
      town: text(raw.town),
    },
    rest,
  );
}

function locationOf(value: JsonValue | undefined): GeoPoint {
  const raw = object(value);
  return GeoPoint.create(num(raw.latitude), num(raw.longitude));
}

const encodeAddress = (address: Address): JsonValue => ({
  areaCode: address.areaCode,
  prefecture: address.prefecture,
  municipality: address.municipality,
  town: address.town,
  rest: address.rest,
});

const encodeLocation = (location: GeoPoint): JsonValue => ({
  latitude: location.latitude,
  longitude: location.longitude,
});

function encodeProfile(profile: PlaceProfile): JsonValue {
  return {
    name: profile.name,
    photoIds: [...PhotoSet.photoIds(profile.photos)],
    photosTakenDown: profile.photos.takenDown,
    description: profile.description,
    address: encodeAddress(profile.address),
    location: encodeLocation(profile.location),
    businessHours: profile.visitInfo.businessHours,
    contact: profile.visitInfo.contact,
  };
}

function decodeProfile(value: JsonValue | undefined): PlaceProfile {
  const raw = object(value);
  return {
    name: normalized(PlaceName.create, text(raw.name)),
    photos: PhotoSet.reconstruct(
      list(raw.photoIds).map(
        (id): PlacePhoto => ({
          photoId: PhotoId.create(text(id)),
        }),
      ),
      bool(raw.photosTakenDown),
      "PLACE",
    ),
    description: optionalNormalized(PlaceDescription.create, raw.description),
    address: addressOf(raw.address),
    location: locationOf(raw.location),
    visitInfo: {
      businessHours: optionalNormalized(
        BusinessHours.create,
        raw.businessHours,
      ),
      contact: optionalNormalized(ContactInfo.create, raw.contact),
    },
  };
}

function encodeState(state: PlaceState): JsonValue {
  return {
    profile: encodeProfile(state.profile),
    operatingStatus: state.operatingStatus,
  };
}

function decodeState(value: JsonValue | undefined): PlaceState {
  const raw = object(value);
  return {
    profile: decodeProfile(raw.profile),
    operatingStatus: OperatingStatus.create(text(raw.operatingStatus)),
  };
}

const ORIGINS: readonly PhotoOrigin[] = ["current", "added"];

function originOf(value: JsonValue | undefined): PhotoOrigin {
  const origin = ORIGINS.find((candidate) => candidate === value);
  if (origin === undefined) throw new Error("Unknown photo origin");
  return origin;
}

function uniquePhotos<P extends RevisedPhoto<PlacePhoto | ListingPhoto>>(
  photos: readonly P[],
): readonly P[] {
  if (new Set(photos.map((photo) => photo.photoId)).size !== photos.length) {
    throw new Error("A revised photo repeats");
  }
  return photos;
}

/** A patch keeps the schema's field order (`FieldPatch.between`). */
function inOrder<C extends { field: string }>(
  order: readonly string[],
  changes: readonly C[],
): readonly C[] {
  const ranks = changes.map((change) => order.indexOf(change.field));
  if (
    ranks.some((rank, i) => rank < 0 || (i > 0 && rank <= (ranks[i - 1] ?? -1)))
  ) {
    throw new Error("Patch fields are out of the schema's order");
  }
  return changes;
}

function encodePlaceChange(change: PlaceChange): JsonValue {
  switch (change.field) {
    case "photos":
      return {
        field: change.field,
        value: change.value.map((photo) => ({
          photoId: photo.photoId,
          origin: photo.origin,
        })),
      };
    case "address":
      return { field: change.field, value: encodeAddress(change.value) };
    case "location":
      return { field: change.field, value: encodeLocation(change.value) };
    default:
      return { field: change.field, value: change.value };
  }
}

function decodePlaceChange(value: JsonValue): PlaceChange {
  const raw = object(value);
  const field = text(raw.field);
  switch (field) {
    case "name":
      return { field, value: normalized(PlaceName.create, text(raw.value)) };
    case "photos":
      return {
        field,
        value: uniquePhotos(
          list(raw.value).map((item): RevisedPhoto<PlacePhoto> => {
            const photo = object(item);
            return {
              photoId: PhotoId.create(text(photo.photoId)),
              origin: originOf(photo.origin),
            };
          }),
        ) satisfies RevisedPhotos<PlacePhoto>,
      };
    case "description":
      return {
        field,
        value: optionalNormalized(PlaceDescription.create, raw.value),
      };
    case "address":
      return { field, value: addressOf(raw.value) };
    case "location":
      return { field, value: locationOf(raw.value) };
    case "businessHours":
      return {
        field,
        value: optionalNormalized(BusinessHours.create, raw.value),
      };
    case "contact":
      return {
        field,
        value: optionalNormalized(ContactInfo.create, raw.value),
      };
    case "operatingStatus":
      return { field, value: OperatingStatus.create(text(raw.value)) };
    default:
      throw new Error(`Unknown place field: ${field}`);
  }
}

// --- Listing ------------------------------------------------------------

function encodeFraming(framing: Framing | null): JsonValue {
  return framing === null ? null : { ...framing };
}

function decodeFraming(value: JsonValue | undefined): Framing | null {
  if (value === null) return null;
  const raw = object(value);
  const framing = Framing.create({
    x: num(raw.x),
    y: num(raw.y),
    width: num(raw.width),
    height: num(raw.height),
  });
  return framing;
}

function encodeOffering(offering: Offering): JsonValue {
  switch (offering.kind) {
    case "none":
      return { kind: "none" };
    case "period":
      return {
        kind: "period",
        start: offering.period.start,
        end: offering.period.end,
      };
    case "dates":
      return { kind: "dates", dates: [...offering.dates] };
  }
}

function localDateOf(value: JsonValue | undefined): LocalDate | null {
  const raw = nullableText(value);
  if (raw === null) return null;
  const date = LocalDate.parse(raw);
  if (date !== raw) throw new Error("A stored date is not normalized");
  return date;
}

function decodeOffering(value: JsonValue | undefined): Offering {
  const raw = object(value);
  switch (raw.kind) {
    case "none":
      return Offering.none();
    case "period":
      return {
        kind: "period",
        period: OfferingPeriod.create({
          start: localDateOf(raw.start),
          end: localDateOf(raw.end),
        }),
      };
    case "dates": {
      const stored = list(raw.dates).map(text);
      const dates = OpenDates.create(stored.map(LocalDate.parse));
      if (
        dates.length !== stored.length ||
        !dates.every((date, i) => date === stored[i])
      ) {
        throw new Error("Open dates are not sorted and unique");
      }
      return { kind: "dates", dates };
    }
    default:
      throw new Error("Unknown offering kind");
  }
}

function encodeListingPhoto(photo: ListingPhoto): JsonValue {
  return { photoId: photo.photoId, framing: encodeFraming(photo.framing) };
}

function decodeListingPhoto(value: JsonValue): ListingPhoto {
  const raw = object(value);
  return {
    photoId: PhotoId.create(text(raw.photoId)),
    framing: decodeFraming(raw.framing),
  };
}

function encodeListingContent(content: ListingContent): JsonValue {
  return {
    name: content.name,
    description: content.description,
    categoryId: content.categoryId,
    photos: content.photos.items.map(encodeListingPhoto),
    photosTakenDown: content.photos.takenDown,
    offering: encodeOffering(content.offering),
  };
}

function decodeListingContent(value: JsonValue | undefined): ListingContent {
  const raw = object(value);
  const categoryId = nullableText(raw.categoryId);
  return {
    name: optionalNormalized(ListingName.create, raw.name),
    description: optionalNormalized(ListingDescription.create, raw.description),
    categoryId: categoryId === null ? null : CategoryId.create(categoryId),
    photos: PhotoSet.reconstruct(
      list(raw.photos).map(decodeListingPhoto),
      bool(raw.photosTakenDown),
      "LISTING",
    ),
    offering: decodeOffering(raw.offering),
  };
}

function encodeListingChange(change: ListingChange): JsonValue {
  switch (change.field) {
    case "photos":
      return {
        field: change.field,
        value: change.value.map((photo) => ({
          photoId: photo.photoId,
          framing: encodeFraming(photo.framing),
          origin: photo.origin,
        })),
      };
    case "offering":
      return { field: change.field, value: encodeOffering(change.value) };
    default:
      return { field: change.field, value: change.value };
  }
}

function decodeListingChange(value: JsonValue): ListingChange {
  const raw = object(value);
  const field = text(raw.field);
  switch (field) {
    case "name":
      return { field, value: normalized(ListingName.create, text(raw.value)) };
    case "description":
      return {
        field,
        value: optionalNormalized(ListingDescription.create, raw.value),
      };
    case "categoryId":
      return { field, value: CategoryId.create(text(raw.value)) };
    case "photos": {
      const photos = uniquePhotos(
        list(raw.value).map((item): RevisedPhoto<ListingPhoto> => {
          const photo = object(item);
          return {
            ...decodeListingPhoto(item),
            origin: originOf(photo.origin),
          };
        }),
      );
      if (photos.length === 0) throw new Error("A revision keeps a photo");
      return { field, value: photos };
    }
    case "offering":
      return { field, value: decodeOffering(raw.value) };
    default:
      throw new Error(`Unknown listing field: ${field}`);
  }
}

/** The codecs each production kind builds its snapshot from. */
export const Codec = {
  profile: { encode: encodeProfile, decode: decodeProfile },
  placeState: { encode: encodeState, decode: decodeState },
  placeRevision: {
    encode: (revision: PlaceRevision): JsonValue =>
      revision.map(encodePlaceChange),
    decode: (value: JsonValue | undefined): PlaceRevision =>
      FieldPatch.create(
        inOrder(PlaceRevision.schema.order, list(value).map(decodePlaceChange)),
      ),
  },
  listingContent: {
    encode: encodeListingContent,
    decode: decodeListingContent,
  },
  publishableListingContent: {
    encode: (content: PublishableListingContent): JsonValue =>
      encodeListingContent(content),
    decode: (value: JsonValue | undefined): PublishableListingContent =>
      ListingContent.toPublishable(decodeListingContent(value)),
  },
  listingPatch: {
    encode: (patch: ListingPatch): JsonValue => patch.map(encodeListingChange),
    decode: (value: JsonValue | undefined): ListingPatch =>
      FieldPatch.create(
        inOrder(
          ListingPatch.schema.order,
          list(value).map(decodeListingChange),
        ),
      ),
  },
  placeId: (value: JsonValue | undefined): PlaceId =>
    PlaceId.create(text(value)),
};
