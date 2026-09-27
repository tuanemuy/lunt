import { Address } from "@repo/core/domain/common/address";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import type { WithEventDrafts } from "@repo/core/domain/common/event";
import { GeoPoint } from "@repo/core/domain/common/geo";
import { PhotoId, PlaceId } from "@repo/core/domain/common/ids";
import {
  PhotosReleasedEvent,
  PhotosTakenDownEvent,
} from "@repo/core/domain/common/photoEvents";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { Suspension } from "@repo/core/domain/common/suspension";
import { Version } from "@repo/core/domain/common/version";
import { RehydrationError } from "@repo/core/domain/error";
import {
  PlaceEvents,
  type PlaceOperatingStatusChangedEvent,
  type PlaceSuspendedEvent,
  type PlaceUnsuspendedEvent,
} from "./events";
import { OperatingStatus } from "./operatingStatus";
import {
  BusinessHours,
  ContactInfo,
  PlaceDescription,
  PlaceName,
  PlaceProfile,
} from "./profile";
import { PlaceRevision } from "./revision";

/**
 * 店舗・スポット (集約ルート). A registered place is published; the only
 * unpublished place is a suspended one. Never deleted, never merged.
 */
export type Place = Readonly<{
  id: PlaceId;
  profile: PlaceProfile;
  operatingStatus: OperatingStatus;
  suspension: Suspension;
  /** When it was registered; immutable. The key of 「新しい順」. */
  registeredAt: Date;
  updatedAt: Date;
  version: Version;
}>;

type PlaceRef = Readonly<{ kind: "place"; id: PlaceId }>;

const refOf = (place: Place): PlaceRef => ({ kind: "place", id: place.id });

const advance = (place: Place, change: Partial<Place>, now: Date): Place => ({
  ...place,
  ...change,
  updatedAt: now,
  version: Version.next(place.version),
});

function noEvents<E>(entity: E): WithEventDrafts<E, never> {
  return { entity, eventDrafts: [] };
}

const unchanged = (place: Place): WithEventDrafts<Place, never> =>
  noEvents(place);

/** Registration (by approval or by proxy): open, not suspended, version 0. No event. */
function register(
  params: Readonly<{ id: PlaceId; profile: PlaceProfile }>,
  now: Date,
): WithEventDrafts<Place, never> {
  return noEvents({
    id: params.id,
    profile: params.profile,
    operatingStatus: "open",
    suspension: Suspension.none,
    registeredAt: now,
    updatedAt: now,
    version: Version.initial(),
  });
}

/**
 * Replaces the profile. Photos go through `PhotoSet.replace`, so a
 * takedown marker survives only an unchanged photo order; photos no
 * longer listed are released. An equal profile returns `place` as is.
 */
function updateProfile(
  place: Place,
  profile: PlaceProfile,
  now: Date,
): WithEventDrafts<Place, PhotosReleasedEvent> {
  if (PlaceProfile.equals(place.profile, profile)) return unchanged(place);
  const photos = PhotoSet.replace(place.profile.photos, profile.photos.items);
  return {
    entity: advance(place, { profile: { ...profile, photos } }, now),
    eventDrafts: PhotosReleasedEvent.draftsFor(
      refOf(place),
      PhotoSet.removedPhotoIds(place.profile.photos, photos),
      now,
    ),
  };
}

/** Any status to any other; the same status returns `place` as is. */
function changeOperatingStatus(
  place: Place,
  next: OperatingStatus,
  now: Date,
): WithEventDrafts<Place, PlaceOperatingStatusChangedEvent> {
  if (place.operatingStatus === next) return unchanged(place);
  return {
    entity: advance(place, { operatingStatus: next }, now),
    eventDrafts: [
      PlaceEvents.operatingStatusChanged(
        place.id,
        place.operatingStatus,
        next,
        now,
      ),
    ],
  };
}

/**
 * Applies an approved revision onto the present content: only its items
 * change (`PlaceRevision.preview`). Emits the status change and the
 * released photos; a revision that changes nothing any more returns
 * `place` as is.
 */
function applyRevision(
  place: Place,
  revision: PlaceRevision,
  now: Date,
): WithEventDrafts<
  Place,
  PlaceOperatingStatusChangedEvent | PhotosReleasedEvent
> {
  const next = PlaceRevision.preview(place, revision);
  const statusChanged = next.operatingStatus !== place.operatingStatus;
  if (
    !statusChanged &&
    PlaceProfile.equals(place.profile, next.profile) &&
    next.profile.photos.takenDown === place.profile.photos.takenDown
  ) {
    return unchanged(place);
  }
  return {
    entity: advance(
      place,
      { profile: next.profile, operatingStatus: next.operatingStatus },
      now,
    ),
    eventDrafts: [
      ...(statusChanged
        ? [
            PlaceEvents.operatingStatusChanged(
              place.id,
              place.operatingStatus,
              next.operatingStatus,
              now,
            ),
          ]
        : []),
      ...PhotosReleasedEvent.draftsFor(
        refOf(place),
        PhotoSet.removedPhotoIds(place.profile.photos, next.profile.photos),
        now,
      ),
    ],
  };
}

/** Throws `PLACE_ALREADY_SUSPENDED` when already suspended. */
function suspend(
  place: Place,
  now: Date,
): WithEventDrafts<Place, PlaceSuspendedEvent> {
  const suspension = Suspension.suspend(place.suspension, "PLACE");
  return {
    entity: advance(place, { suspension }, now),
    eventDrafts: [PlaceEvents.suspended(place.id, now)],
  };
}

/** Throws `PLACE_NOT_SUSPENDED` when not suspended. */
function unsuspend(
  place: Place,
  now: Date,
): WithEventDrafts<Place, PlaceUnsuspendedEvent> {
  const suspension = Suspension.unsuspend(place.suspension, "PLACE");
  return {
    entity: advance(place, { suspension }, now),
    eventDrafts: [PlaceEvents.unsuspended(place.id, now)],
  };
}

/**
 * Removes photos on a takedown claim (`PhotoSet.takeDown`, which sets
 * `takenDown`). Throws `PLACE_PHOTO_NOT_FOUND` and removes nothing when
 * any id is not the place's. The place stays published even with no
 * photos left (`unpublished` is always `false`).
 */
function takeDownPhotos(
  place: Place,
  photoIds: readonly [PhotoId, ...PhotoId[]],
  now: Date,
): WithEventDrafts<Place, PhotosTakenDownEvent | PhotosReleasedEvent> {
  const [first, ...rest] = photoIds;
  const ids: readonly [PhotoId, ...PhotoId[]] = [
    first,
    ...rest.filter((id, i) => id !== first && rest.indexOf(id) === i),
  ];
  const photos = PhotoSet.takeDown(place.profile.photos, ids, "PLACE");
  return {
    entity: advance(place, { profile: { ...place.profile, photos } }, now),
    eventDrafts: [
      PhotosTakenDownEvent.draft(
        { owner: refOf(place), photoIds: ids, unpublished: false },
        now,
      ),
      PhotosReleasedEvent.draft(refOf(place), ids, now),
    ],
  };
}

const isSuspended = (place: Place): boolean => place.suspension.suspended;

/** A place at rest: primitives only, the inverse of `reconstruct`. */
export type PlaceSnapshot = Readonly<{
  id: string;
  name: string;
  photoIds: readonly string[];
  photosTakenDown: boolean;
  description: string | null;
  address: Readonly<{
    areaCode: string;
    prefecture: string;
    municipality: string;
    town: string;
    rest: string;
  }>;
  location: Readonly<{ latitude: number; longitude: number }>;
  businessHours: string | null;
  contact: string | null;
  operatingStatus: string;
  suspended: boolean;
  registeredAt: Date;
  updatedAt: Date;
  version: number;
}>;

function snapshot(place: Place): PlaceSnapshot {
  const { profile } = place;
  return {
    id: place.id,
    name: profile.name,
    photoIds: PhotoSet.photoIds(profile.photos),
    photosTakenDown: profile.photos.takenDown,
    description: profile.description,
    address: {
      areaCode: profile.address.areaCode,
      prefecture: profile.address.prefecture,
      municipality: profile.address.municipality,
      town: profile.address.town,
      rest: profile.address.rest,
    },
    location: {
      latitude: profile.location.latitude,
      longitude: profile.location.longitude,
    },
    businessHours: profile.visitInfo.businessHours,
    contact: profile.visitInfo.contact,
    operatingStatus: place.operatingStatus,
    suspended: place.suspension.suspended,
    registeredAt: place.registeredAt,
    updatedAt: place.updatedAt,
    version: place.version,
  };
}

function storedText<T extends string>(
  value: string,
  create: (input: string) => T,
): T {
  const built = create(value);
  if (built !== value) throw new Error(`Text is not trimmed: ${value}`);
  return built;
}

function storedOptional<T extends string>(
  value: string | null,
  create: (input: string) => T,
): T | null {
  return value === null ? null : storedText(value, create);
}

function storedDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) throw new Error("Invalid stored date");
  return value;
}

/** Rebuilds a stored place through its value objects; `RehydrationError` on any violation. */
function reconstruct(input: PlaceSnapshot): Place {
  try {
    const rest = input.address.rest;
    if (rest !== rest.trim()) throw new Error("Address rest is not trimmed");
    const profile: PlaceProfile = {
      name: storedText(input.name, PlaceName.create),
      photos: PhotoSet.reconstruct(
        input.photoIds.map((id) => ({ photoId: PhotoId.create(id) })),
        input.photosTakenDown,
        "PLACE",
      ),
      description: storedOptional(input.description, PlaceDescription.create),
      address: Address.of(
        {
          areaCode: AreaCode.create(input.address.areaCode),
          prefecture: input.address.prefecture,
          municipality: input.address.municipality,
          town: input.address.town,
        },
        rest,
      ),
      location: GeoPoint.create(
        input.location.latitude,
        input.location.longitude,
      ),
      visitInfo: {
        businessHours: storedOptional(
          input.businessHours,
          BusinessHours.create,
        ),
        contact: storedOptional(input.contact, ContactInfo.create),
      },
    };
    return {
      id: PlaceId.create(input.id),
      profile,
      operatingStatus: OperatingStatus.create(input.operatingStatus),
      suspension: { suspended: input.suspended },
      registeredAt: storedDate(input.registeredAt),
      updatedAt: storedDate(input.updatedAt),
      version: Version.create(input.version),
    };
  } catch (error) {
    throw new RehydrationError("Stored place violates invariants", error);
  }
}

export const Place = {
  register,
  updateProfile,
  changeOperatingStatus,
  applyRevision,
  suspend,
  unsuspend,
  takeDownPhotos,
  isSuspended,
  reconstruct,
  snapshot,
  ref: refOf,
};
