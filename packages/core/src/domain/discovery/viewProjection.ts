import type { Address } from "@repo/core/domain/common/address";
import type { GeoPoint } from "@repo/core/domain/common/geo";
import type {
  CategoryId,
  ListingId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { ListingContent } from "@repo/core/domain/listing/content";
import {
  Listing,
  type PublishedListing,
} from "@repo/core/domain/listing/listing";
import {
  type ManualEnd,
  type Offering,
  OfferingStatus,
} from "@repo/core/domain/listing/offering";
import type {
  ListingDescription,
  ListingName,
  ListingPhoto,
} from "@repo/core/domain/listing/values";
import type { Place } from "@repo/core/domain/place/place";
import type {
  PlaceDescription,
  PlaceName,
  PlacePhoto,
  VisitInfo,
} from "@repo/core/domain/place/profile";
import type {
  CoverPhoto,
  ListingEntry,
  PlaceEntry,
  RegionContext,
  SubstituteCover,
} from "./entry";
import type {
  PlaceAffiliations,
  PublishedRegion,
  Region,
  RegionLabel,
} from "./stagedKinds";
import { type ListingStanding, type PlaceStanding, Standing } from "./standing";
import { VisibilityPolicy } from "./visibilityPolicy";

export type OwnCover = Extract<CoverPhoto, { source: "own" }>;

/**
 * A listing in a list, overview or frame. Price and tagline do not exist on
 * a listing; description and category are not shown in a summary. The
 * listing, place and region names are separate fields (V-05, B-02).
 */
export type ListingSummary = Readonly<{
  listingId: ListingId;
  placeId: PlaceId;
  cover: OwnCover;
  listingName: ListingName;
  placeName: PlaceName;
  region: RegionLabel | null;
  standing: ListingStanding;
}>;

/**
 * A place in a list, overview or map card. `cover` is the place's own first
 * photo, else the substitute listing photo, else `null`.
 */
export type PlaceSummary = Readonly<{
  placeId: PlaceId;
  cover: CoverPhoto | null;
  name: PlaceName;
  address: Address;
  location: GeoPoint;
  region: RegionLabel | null;
  standing: PlaceStanding;
}>;

/**
 * A listing's detail as viewers see it. `categoryId` is as stored; the
 * caller resolves it to the active category (`CategoryCatalog.resolve`).
 * `regions` are all of the place's viewable regions in entry order.
 */
export type ListingDetail = Readonly<{
  listingId: ListingId;
  name: ListingName;
  description: ListingDescription | null;
  categoryId: CategoryId;
  /** Registration order, each with its framing; the first is the cover. */
  photos: readonly ListingPhoto[];
  offering: Offering;
  standing: ListingStanding;
  place: PlaceSummary;
  regions: readonly PublishedRegion[];
}>;

/**
 * A place's detail as viewers see it: its own content only — a place
 * without photos has none (no substitute).
 */
export type PlaceDetail = Readonly<{
  placeId: PlaceId;
  name: PlaceName;
  /** Registration order; the first is the cover. */
  photos: readonly PlacePhoto[];
  description: PlaceDescription | null;
  address: Address;
  location: GeoPoint;
  visitInfo: VisitInfo;
  standing: PlaceStanding;
  regions: readonly PublishedRegion[];
}>;

/**
 * Unpublished listing content projected by the same rules as
 * `listingSummary` and the listing detail. Name, category and cover may be
 * missing, since the content need not meet the publish condition; the
 * place is projected even when suspended.
 */
export type ListingPreview = Readonly<{
  summary: Readonly<{
    placeId: PlaceId;
    cover: OwnCover | null;
    listingName: ListingName | null;
    placeName: PlaceName;
    region: RegionLabel | null;
    standing: ListingStanding;
  }>;
  detail: Readonly<{
    name: ListingName | null;
    description: ListingDescription | null;
    categoryId: CategoryId | null;
    photos: readonly ListingPhoto[];
    offering: Offering;
    standing: ListingStanding;
    place: PlaceSummary;
    regions: readonly PublishedRegion[];
  }>;
}>;

export type ListingPreviewInput = Readonly<{
  content: ListingContent;
  /** The stored listing's `Listing.manualEndOf`; `ManualEnd.none()` for an application's content. */
  manualEnd: ManualEnd;
  place: Place;
  affiliations: PlaceAffiliations | null;
  regions: readonly Region[];
}>;

/** 「新しい順」 of listings: `firstPublishedAt` descending, then id ascending (code point). */
const compareNewestListings = (
  a: Pick<PublishedListing, "id" | "publication">,
  b: Pick<PublishedListing, "id" | "publication">,
): number => {
  const byTime =
    b.publication.firstPublishedAt.getTime() -
    a.publication.firstPublishedAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * Viewable affiliated regions, the displayed region first, then in
 * affiliation order; empty without affiliations. Region lands in stage 3,
 * so there are none yet.
 */
function regionsOf(
  _affiliations: PlaceAffiliations | null,
  _regions: readonly Region[],
): readonly PublishedRegion[] {
  return [];
}

/**
 * The cover photo of the newest viewable listing among `listings` (any
 * offering phase), for a viewable place without photos (P-43). `null` when
 * the place has a photo, is not viewable, or has no viewable listing.
 */
function substituteCover(
  place: Place,
  listings: readonly Listing[],
): SubstituteCover | null {
  if (
    place.profile.photos.items.length > 0 ||
    !VisibilityPolicy.isPlaceViewable(place)
  ) {
    return null;
  }
  const newest = listings
    .filter(
      (listing): listing is PublishedListing =>
        listing.placeId === place.id &&
        Listing.isPublished(listing) &&
        VisibilityPolicy.isListingViewable(listing, place),
    )
    .sort(compareNewestListings)[0];
  if (newest === undefined) return null;
  const [photo] = newest.content.photos.items;
  return { listingId: newest.id, photo };
}

function placeEntry(
  place: Place,
  affiliations: PlaceAffiliations | null,
  regions: readonly Region[],
  listings: readonly Listing[],
): PlaceEntry {
  return {
    place,
    regions: regionsOf(affiliations, regions),
    substituteCover: substituteCover(place, listings),
  };
}

const labelOf = (region: PublishedRegion): RegionLabel => region;

const regionIdOf = (region: PublishedRegion): RegionId => region;

/**
 * `displayed`: the first of the entry's regions (none → no region name).
 * `within`: that region among the entry's regions.
 */
function regionLabel(
  entry: Pick<PlaceEntry, "regions">,
  context: RegionContext,
): RegionLabel | null {
  const region =
    context.kind === "displayed"
      ? entry.regions[0]
      : entry.regions.find((r) => regionIdOf(r) === context.regionId);
  return region === undefined ? null : labelOf(region);
}

const ownListingCover = (photo: ListingPhoto): OwnCover => ({
  source: "own",
  photoId: photo.photoId,
  framing: photo.framing,
});

function listingSummary(
  entry: ListingEntry,
  context: RegionContext,
  today: LocalDate,
): ListingSummary {
  const { listing, place } = entry;
  return {
    listingId: listing.id,
    placeId: place.place.id,
    cover: ownListingCover(listing.content.photos.items[0]),
    listingName: listing.content.name,
    placeName: place.place.profile.name,
    region: regionLabel(place, context),
    standing: Standing.ofListing(listing, place.place, today),
  };
}

function placeCover(entry: PlaceEntry): CoverPhoto | null {
  const [own] = entry.place.profile.photos.items;
  if (own !== undefined) {
    return { source: "own", photoId: own.photoId, framing: null };
  }
  const substitute = entry.substituteCover;
  if (substitute === null) return null;
  return {
    source: "listing",
    listingId: substitute.listingId,
    photoId: substitute.photo.photoId,
    framing: substitute.photo.framing,
  };
}

function placeSummary(entry: PlaceEntry, context: RegionContext): PlaceSummary {
  const { place } = entry;
  return {
    placeId: place.id,
    cover: placeCover(entry),
    name: place.profile.name,
    address: place.profile.address,
    location: place.profile.location,
    region: regionLabel(entry, context),
    standing: Standing.ofPlace(place),
  };
}

function listingDetail(entry: ListingEntry, today: LocalDate): ListingDetail {
  const { listing, place } = entry;
  return {
    listingId: listing.id,
    name: listing.content.name,
    description: listing.content.description,
    categoryId: listing.content.categoryId,
    photos: listing.content.photos.items,
    offering: listing.content.offering,
    standing: Standing.ofListing(listing, place.place, today),
    place: placeSummary(place, { kind: "displayed" }),
    regions: place.regions,
  };
}

function placeDetail(entry: PlaceEntry): PlaceDetail {
  const { place } = entry;
  return {
    placeId: place.id,
    name: place.profile.name,
    photos: place.profile.photos.items,
    description: place.profile.description,
    address: place.profile.address,
    location: place.profile.location,
    visitInfo: place.profile.visitInfo,
    standing: Standing.ofPlace(place),
    regions: entry.regions,
  };
}

function previewListing(
  input: ListingPreviewInput,
  today: LocalDate,
): ListingPreview {
  const { content, place } = input;
  const entry: PlaceEntry = {
    place,
    regions: regionsOf(input.affiliations, input.regions),
    substituteCover: null,
  };
  const standing: ListingStanding = {
    kind: "listing",
    offering: OfferingStatus.of(content.offering, input.manualEnd, today),
    operating: place.operatingStatus,
  };
  const [first] = content.photos.items;
  return {
    summary: {
      placeId: place.id,
      cover: first === undefined ? null : ownListingCover(first),
      listingName: content.name,
      placeName: place.profile.name,
      region: regionLabel(entry, { kind: "displayed" }),
      standing,
    },
    detail: {
      name: content.name,
      description: content.description,
      categoryId: content.categoryId,
      photos: content.photos.items,
      offering: content.offering,
      standing,
      place: placeSummary(entry, { kind: "displayed" }),
      regions: entry.regions,
    },
  };
}

/**
 * A listing detail's 「他の掲載」: `samePlace` without `self`, then
 * `sameRegion`, cut to the first `limit` (the screen's count).
 */
function pickOtherListings(
  self: ListingId,
  samePlace: readonly ListingEntry[],
  sameRegion: readonly ListingEntry[],
  limit: number,
): readonly ListingEntry[] {
  return [
    ...samePlace.filter((entry) => entry.listing.id !== self),
    ...sameRegion,
  ].slice(0, limit);
}

/**
 * How entries and summaries are built (`spec/domains/discovery.md`
 * 「ViewProjection」): the region a summary names, the substitute cover of a
 * place without photos, and what each summary and detail shows are decided
 * here only.
 */
export const ViewProjection = {
  regionsOf,
  substituteCover,
  placeEntry,
  regionLabel,
  listingSummary,
  placeSummary,
  listingDetail,
  placeDetail,
  previewListing,
  pickOtherListings,
  compareNewestListings,
};
