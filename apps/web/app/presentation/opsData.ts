// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { viewMembers } from "@repo/core/application/authority/viewMembers";
import { getContainer } from "@repo/core/application/di/containerStore";
import { getManagedListing } from "@repo/core/application/listing/getManagedListing";
import { searchListingsForOperation } from "@repo/core/application/listing/searchListingsForOperation";
import { getManagedPlace } from "@repo/core/application/place/getManagedPlace";
import { matchPlacesForOperation } from "@repo/core/application/place/matchPlacesForOperation";
import { Address } from "@repo/core/domain/common/address";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { requireActor } from "./actor";
import { listingPhotoItem, publicationView } from "./listingData";
import type { ListingMatchItem, MatchPage, PlaceMatchItem } from "./opsSearch";
import type { OpsSubjectData, OpsSubjectKind } from "./opsSubject";
import { listingIdOf, placeIdOf } from "./targetIds";

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

/** OM-03: one store or listing, whatever its state. */
export async function loadOpsSubject(
  kind: OpsSubjectKind,
  rawId: string,
): Promise<OpsSubjectData> {
  const { container, actor } = await actorAndContainer();
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
  }
}
