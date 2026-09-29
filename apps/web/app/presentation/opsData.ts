// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { viewMembers } from "@repo/core/application/authority/viewMembers";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import { getManagedListing } from "@repo/core/application/listing/getManagedListing";
import { searchListingsForOperation } from "@repo/core/application/listing/searchListingsForOperation";
import { getManagedOccasion } from "@repo/core/application/occasion/getManagedOccasion";
import { searchOccasionsForOperation } from "@repo/core/application/occasion/searchOccasionsForOperation";
import { suspendOccasion } from "@repo/core/application/occasion/suspendOccasion";
import { unsuspendOccasion } from "@repo/core/application/occasion/unsuspendOccasion";
import { getManagedPlace } from "@repo/core/application/place/getManagedPlace";
import { matchPlacesForOperation } from "@repo/core/application/place/matchPlacesForOperation";
import { getManagedRegion } from "@repo/core/application/region/getManagedRegion";
import { searchRegionsForOperation } from "@repo/core/application/region/searchRegionsForOperation";
import { suspendRegion } from "@repo/core/application/region/suspendRegion";
import { unsuspendRegion } from "@repo/core/application/region/unsuspendRegion";
import type { Actor } from "@repo/core/domain/common/actor";
import { Address } from "@repo/core/domain/common/address";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { requireActor } from "./actor";
import { listingPhotoItem, publicationView } from "./listingData";
import { requireOperator } from "./operatorAccess";
import type {
  ListingMatchItem,
  MatchPage,
  OccasionMatchItem,
  PlaceMatchItem,
  RegionMatchItem,
} from "./opsSearch";
import type {
  OpsSubjectData,
  OpsSubjectKind,
  SuspendableKind,
} from "./opsSubject";
import { listingIdOf, occasionIdOf, placeIdOf, regionIdOf } from "./targetIds";

async function actorAndContainer() {
  const container = await getContainer();
  return { container, actor: await requireActor(container) };
}

const blankToNull = (text: string): string | null =>
  text.trim() === "" ? null : text;

/** OM-02: stores by name and / or address, suspended ones included. */
export async function searchPlaces(
  name: string,
  address: string,
  pagination: Pagination,
): Promise<MatchPage<PlaceMatchItem>> {
  const { container, actor } = await actorAndContainer();
  const page = await matchPlacesForOperation({
    container,
    actor,
    input: {
      name: blankToNull(name),
      address: blankToNull(address),
      pagination,
    },
  });
  return {
    count: page.count,
    items: page.items.map((place) => ({
      placeId: place.placeId,
      name: place.name,
      address: Address.text(place.address),
      operatingStatus: place.operatingStatus,
      suspended: place.suspended,
      hasSteward: place.hasSteward,
    })),
  };
}

/** OM-02: listings by keyword, in any state. */
export async function searchListings(
  keyword: string,
  pagination: Pagination,
): Promise<MatchPage<ListingMatchItem>> {
  const { container, actor } = await actorAndContainer();
  const page = await searchListingsForOperation({
    container,
    actor,
    input: { keyword, pagination },
  });
  return {
    count: page.count,
    items: page.items.map((listing) => ({
      listingId: listing.id,
      name: listing.name,
      placeId: listing.place.id,
      placeName: listing.place.name,
      publication: publicationView(listing.publication),
      suspended: listing.suspended,
      offeringStatus: listing.offeringStatus,
      hasSteward: listing.hasSteward,
    })),
  };
}

/** OM-02: regions by keyword, drafts, unpublished and suspended ones included. */
export async function searchRegions(
  keyword: string,
  pagination: Pagination,
): Promise<MatchPage<RegionMatchItem>> {
  const { container, actor } = await actorAndContainer();
  const page = await searchRegionsForOperation({
    container,
    actor,
    input: { keyword, pagination },
  });
  return {
    count: page.count,
    items: page.items.map(({ region, hasSteward }) => ({
      regionId: region.id,
      name: region.content.name,
      address:
        region.content.address === null
          ? null
          : Address.text(region.content.address),
      publication: publicationView(region.publication),
      suspended: region.suspension.suspended,
      hasSteward,
    })),
  };
}

/** OM-02: events by keyword, in any state. */
export async function searchOccasions(
  keyword: string,
  pagination: Pagination,
): Promise<MatchPage<OccasionMatchItem>> {
  const { container, actor } = await actorAndContainer();
  const page = await searchOccasionsForOperation({
    container,
    actor,
    input: { keyword, pagination },
  });
  return {
    count: page.count,
    items: page.items.map((occasion) => ({
      occasionId: occasion.id,
      name: occasion.name,
      publication: publicationView(occasion.publication),
      suspended: occasion.suspended,
      holdingStatus: occasion.holdingStatus,
      hasSteward: occasion.hasSteward,
    })),
  };
}

/** OM-03: suspends or lifts the suspension of a region or an event (MOD-07). */
export async function changeSuspension(
  kind: SuspendableKind,
  rawId: string,
  suspend: boolean,
): Promise<void> {
  const { container, actor } = await actorAndContainer();
  if (kind === "region") {
    const input = { regionId: regionIdOf(rawId) };
    await (suspend ? suspendRegion : unsuspendRegion)({
      container,
      actor,
      input,
    });
    return;
  }
  const input = { occasionId: occasionIdOf(rawId) };
  await (suspend ? suspendOccasion : unsuspendOccasion)({
    container,
    actor,
    input,
  });
}

/** The stewards counted and the pending invitations, for OM-03's 管理者. */
async function invitationsOf(
  container: RequestContainer,
  actor: Actor,
  target: StewardedRef,
) {
  const members = await viewMembers({ container, actor, input: { target } });
  return {
    stewardCount: members.stewards.length,
    invitations: members.invitations.map((invitation) => ({
      email: invitation.email,
      invitedAt: invitation.invitedAt.toISOString(),
    })),
  };
}

/**
 * OM-03: one store, listing, region or event, whatever its state. The
 * subject is read first so a missing one is CS-17 for anyone
 * (`NotFoundError` before access); the reads let a steward in too
 * (`inspect_target`), and the render endpoint can be called without the
 * area guard, so the operator role is checked after them.
 */
export async function loadOpsSubject(
  kind: OpsSubjectKind,
  rawId: string,
): Promise<OpsSubjectData> {
  const { container, actor } = await actorAndContainer();
  const data = await readOpsSubject(container, actor, kind, rawId);
  await requireOperator(container, actor);
  return data;
}

async function readOpsSubject(
  container: RequestContainer,
  actor: Actor,
  kind: OpsSubjectKind,
  rawId: string,
): Promise<OpsSubjectData> {
  switch (kind) {
    case "place": {
      const placeId = placeIdOf(rawId);
      const [view, members] = await Promise.all([
        getManagedPlace({ container, actor, input: { placeId } }),
        viewMembers({
          container,
          actor,
          input: { target: { kind: "place", id: placeId } },
        }),
      ]);
      const [cover] = view.photos;
      return {
        kind: "place",
        placeId,
        name: view.place.profile.name,
        cover:
          cover === undefined
            ? null
            : { photoId: cover.photoId, url: cover.displayRef.url },
        address: Address.text(view.place.profile.address),
        operatingStatus: view.place.operatingStatus,
        suspended: view.suspended,
        stewardCount: members.stewards.length,
        invitations: members.invitations.map((invitation) => ({
          email: invitation.email,
          invitedAt: invitation.invitedAt.toISOString(),
        })),
      };
    }
    case "listing": {
      const view = await getManagedListing({
        container,
        actor,
        input: { listingId: listingIdOf(rawId) },
      });
      const [cover] = view.photos;
      return {
        kind: "listing",
        listingId: view.id,
        name: view.name,
        cover: cover === undefined ? null : listingPhotoItem(cover),
        publication: publicationView(view.publication),
        suspended: view.suspended,
        offeringStatus: view.offeringStatus,
        place: {
          id: view.place.id,
          name: view.place.name,
          suspended: view.place.suspended,
          hasSteward: view.access.hasSteward,
        },
      };
    }
    case "region": {
      const regionId = regionIdOf(rawId);
      const [view, members] = await Promise.all([
        getManagedRegion({ container, actor, input: { regionId } }),
        invitationsOf(container, actor, { kind: "region", id: regionId }),
      ]);
      const [cover] = view.photos;
      return {
        kind: "region",
        regionId,
        name: view.region.content.name,
        cover:
          cover === undefined
            ? null
            : { photoId: cover.photoId, url: cover.displayRef.url },
        publication: publicationView(view.region.publication),
        suspended: view.suspended,
        viewable: view.viewable,
        ...members,
      };
    }
    case "occasion": {
      const occasionId = occasionIdOf(rawId);
      const [view, members] = await Promise.all([
        getManagedOccasion({ container, actor, input: { occasionId } }),
        invitationsOf(container, actor, { kind: "occasion", id: occasionId }),
      ]);
      const cover = view.photos.find((photo) => photo.display !== null);
      return {
        kind: "occasion",
        occasionId,
        name: view.name,
        cover:
          cover?.display == null
            ? null
            : { photoId: cover.photoId, url: cover.display.url },
        publication: publicationView(view.publication),
        suspended: view.suspended,
        holdingStatus: view.holdingStatus,
        period:
          view.period === null
            ? null
            : { start: view.period.start, end: view.period.end },
        viewable: view.viewable,
        ...members,
      };
    }
  }
}
