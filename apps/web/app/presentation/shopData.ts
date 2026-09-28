// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { viewMembers } from "@repo/core/application/authority/viewMembers";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import { ForbiddenError } from "@repo/core/application/errors";
import { listPlaceListings } from "@repo/core/application/listing/listPlaceListings";
import { getManagedPlace } from "@repo/core/application/place/getManagedPlace";
import { listStewardedPlaces } from "@repo/core/application/place/listStewardedPlaces";
import type { PlaceProfileFields } from "@repo/core/application/place/profileInput";
import { TownRef } from "@repo/core/domain/area/townRef";
import type { Actor } from "@repo/core/domain/common/actor";
import { Address } from "@repo/core/domain/common/address";
import { PhotoId } from "@repo/core/domain/common/ids";
import { requireActor } from "./actor";
import { loadAreaLists, townOfAddress } from "./areaData";
import type { PlaceProfileInput } from "./place";
import {
  type AreaLists,
  PLACE_PROXY_UNAVAILABLE,
  type PlaceEditorData,
  type PlaceFrame,
  type ShopHomeData,
  type ShopSummary,
} from "./placeView";
import { placeIdOf } from "./targetIds";

/**
 * The SM screens' check on a store read with `inspect_target` (its
 * stewards and every operator): only `manage_target` may go on. The read
 * let the actor in, so a refusal here is an operator facing a store that
 * has a steward (CS-15). Every SM loader repeats it, since the RSC render
 * endpoints can be called without the area's guard.
 */
export function requireManagement(manageable: boolean): void {
  if (!manageable) {
    throw new ForbiddenError(
      PLACE_PROXY_UNAVAILABLE,
      "The store has a steward, so an operator may not manage it",
    );
  }
}

/** See `loadPlaceFrameFn`. */
export async function loadPlaceFrame(
  container: RequestContainer,
  actor: Actor,
  rawPlaceId: string,
): Promise<PlaceFrame> {
  const placeId = placeIdOf(rawPlaceId);
  const view = await getManagedPlace({ container, actor, input: { placeId } });
  requireManagement(view.management.allowed);
  const basis =
    view.management.allowed && view.management.basis === "steward"
      ? "steward"
      : "proxy";
  const stewarded: readonly ShopSummary[] =
    basis === "steward"
      ? (await listStewardedPlaces({ container, actor, input: {} })).map(
          (place) => ({
            placeId: place.placeId,
            name: place.name,
            operatingStatus: place.operatingStatus,
            suspended: place.suspended,
          }),
        )
      : [];
  return {
    placeId: view.place.id,
    name: view.place.profile.name,
    operatingStatus: view.place.operatingStatus,
    suspended: view.suspended,
    basis,
    hasSteward: view.hasSteward,
    stewarded,
  };
}

/** The transport's profile as the usecases take it: ids and the town through their value objects. */
export function profileFieldsOf(input: PlaceProfileInput): PlaceProfileFields {
  return {
    name: input.name,
    photoIds: input.photoIds.map(PhotoId.create),
    description: input.description,
    town: TownRef.create(input.town),
    addressRest: input.addressRest,
    location: input.location,
    businessHours: input.businessHours,
    contact: input.contact,
  };
}

async function actorAndContainer() {
  const container = await getContainer();
  return { container, actor: await requireActor(container) };
}

/** SM-01. */
export async function loadShopHome(rawPlaceId: string): Promise<ShopHomeData> {
  const { container, actor } = await actorAndContainer();
  const placeId = placeIdOf(rawPlaceId);
  const view = await getManagedPlace({ container, actor, input: { placeId } });
  requireManagement(view.management.allowed);
  const [listings, members] = await Promise.all([
    listPlaceListings({
      container,
      actor,
      input: {
        placeId,
        shelf: { publication: null, phase: null },
        pagination: { page: 1, limit: 1 },
      },
    }),
    viewMembers({
      container,
      actor,
      input: { target: { kind: "place", id: placeId } },
    }),
  ]);
  const [cover] = view.photos;
  const { publication, phase } = listings.counts;
  return {
    cover:
      cover === undefined
        ? null
        : { photoId: cover.photoId, url: cover.displayRef.url },
    name: view.place.profile.name,
    operatingStatus: view.place.operatingStatus,
    suspended: view.suspended,
    photosTakenDown: view.photosTakenDown,
    listingCounts: {
      all: listings.count,
      published: publication.published,
      draft: publication.draft,
      hidden: publication.hidden,
      ended: phase.ended,
    },
    stewardCount: members.stewards.length,
  };
}

/** SM-02 (編集). */
export async function loadPlaceEditor(
  rawPlaceId: string,
): Promise<PlaceEditorData> {
  const { container, actor } = await actorAndContainer();
  const view = await getManagedPlace({
    container,
    actor,
    input: { placeId: placeIdOf(rawPlaceId) },
  });
  requireManagement(view.management.allowed);
  const { place } = view;
  const { profile } = place;
  const town = await townOfAddress(container, profile.address);
  return {
    placeId: place.id,
    version: place.version,
    name: profile.name,
    photos: view.photos.map((photo) => ({
      photoId: photo.photoId,
      url: photo.displayRef.url,
    })),
    photosTakenDown: view.photosTakenDown,
    description: profile.description ?? "",
    town,
    addressRest: profile.address.rest,
    addressText: Address.text(profile.address),
    location: {
      latitude: profile.location.latitude,
      longitude: profile.location.longitude,
    },
    businessHours: profile.visitInfo.businessHours ?? "",
    contact: profile.visitInfo.contact ?? "",
    operatingStatus: place.operatingStatus,
    suspended: view.suspended,
    areaLists: await loadAreaLists(container, town),
  };
}

/** SM-02 (新規・代理登録): only the prefectures to start the address from. */
export async function loadNewPlaceLists(): Promise<AreaLists> {
  return loadAreaLists(await getContainer(), null);
}
