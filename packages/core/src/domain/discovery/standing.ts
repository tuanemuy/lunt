import type { LocalDate } from "@repo/core/domain/common/localDate";
import {
  Listing,
  type PublishedListing,
} from "@repo/core/domain/listing/listing";
import type { OfferingStatus } from "@repo/core/domain/listing/offering";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import type { Place } from "@repo/core/domain/place/place";

export type ListingStanding = Readonly<{
  kind: "listing";
  offering: OfferingStatus;
  operating: OperatingStatus;
}>;

export type PlaceStanding = Readonly<{
  kind: "place";
  operating: OperatingStatus;
}>;

/**
 * What the scene rules look at and what viewers are shown: a listing's
 * offering status (an upcoming one carries its start day) and its place's
 * operating status; a place's operating status. Occasions (holding status)
 * join in stage 3; regions and articles have no standing.
 */
export type Standing = ListingStanding | PlaceStanding;

const ofListing = (
  listing: PublishedListing,
  place: Pick<Place, "operatingStatus">,
  today: LocalDate,
): ListingStanding => ({
  kind: "listing",
  offering: Listing.offeringStatus(listing, today),
  operating: place.operatingStatus,
});

const ofPlace = (place: Pick<Place, "operatingStatus">): PlaceStanding => ({
  kind: "place",
  operating: place.operatingStatus,
});

export const Standing = { ofListing, ofPlace };
