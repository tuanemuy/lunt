import type { LocalDate } from "@repo/core/domain/common/localDate";
import {
  Listing,
  type PublishedListing,
} from "@repo/core/domain/listing/listing";
import type { OfferingStatus } from "@repo/core/domain/listing/offering";
import {
  type Cancellation,
  HoldingStatus,
} from "@repo/core/domain/occasion/holdingStatus";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
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

export type OccasionStanding = Readonly<{
  kind: "occasion";
  holding: HoldingStatus;
}>;

export type RegionStanding = Readonly<{ kind: "region" }>;

export type ArticleStanding = Readonly<{ kind: "article" }>;

/**
 * What the scene rules look at and what viewers are shown: a listing's
 * offering status (an upcoming one carries its start day) and its place's
 * operating status; a place's operating status; an occasion's holding
 * status. Regions and articles have no standing that changes with the
 * scene.
 */
export type Standing =
  | ListingStanding
  | PlaceStanding
  | OccasionStanding
  | RegionStanding
  | ArticleStanding;

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

/**
 * `Occasion.holdingStatus` of a published occasion, which always has a
 * period — so the status is always decided.
 */
const ofOccasion = (
  occasion: Readonly<{
    content: Pick<PublishedOccasion["content"], "period">;
    cancellation: Cancellation;
  }>,
  today: LocalDate,
): OccasionStanding => {
  const holding = HoldingStatus.of(
    occasion.content.period,
    occasion.cancellation,
    today,
  );
  if (holding === null) {
    throw new TypeError("A published occasion's holding status is decided");
  }
  return { kind: "occasion", holding };
};

const REGION: RegionStanding = { kind: "region" };
const ARTICLE: ArticleStanding = { kind: "article" };

export const Standing = {
  ofListing,
  ofPlace,
  ofOccasion,
  ofRegion: (): RegionStanding => REGION,
  ofArticle: (): ArticleStanding => ARTICLE,
};
