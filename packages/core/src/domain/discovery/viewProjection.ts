import type { Address } from "@repo/core/domain/common/address";
import type { DateRange } from "@repo/core/domain/common/dateRange";
import type { GeoPoint } from "@repo/core/domain/common/geo";
import type {
  CategoryId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { Tagline } from "@repo/core/domain/common/tagline";
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
import type { OccasionPhoto } from "@repo/core/domain/occasion/content";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type {
  CompleteVenue,
  OccasionDescription,
  OccasionName,
} from "@repo/core/domain/occasion/values";
import type { Place } from "@repo/core/domain/place/place";
import type {
  PlaceDescription,
  PlaceName,
  PlacePhoto,
  VisitInfo,
} from "@repo/core/domain/place/profile";
import type { RegionPhoto } from "@repo/core/domain/region/content";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import type { PublishedRegion, Region } from "@repo/core/domain/region/region";
import type {
  RegionDescription,
  RegionName,
} from "@repo/core/domain/region/values";
import type {
  CoverPhoto,
  ListingEntry,
  PlaceEntry,
  RegionContext,
  SubstituteCover,
} from "./entry";
import {
  type ListingStanding,
  type OccasionStanding,
  type PlaceStanding,
  Standing,
} from "./standing";
import { VisibilityPolicy } from "./visibilityPolicy";

/** The region name a place or listing summary shows (`ViewProjection.regionLabel`). */
export type RegionLabel = RegionName;

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

/** A region in a list, overview or frame; its introduction is not shown. */
export type RegionSummary = Readonly<{
  regionId: RegionId;
  cover: OwnCover;
  name: RegionName;
  tagline: Tagline | null;
  address: Address;
  location: GeoPoint;
}>;

/**
 * An occasion in a list, overview or frame, with its holding status; its
 * introduction is not shown.
 */
export type OccasionSummary = Readonly<{
  occasionId: OccasionId;
  cover: OwnCover;
  name: OccasionName;
  tagline: Tagline | null;
  period: DateRange;
  venue: CompleteVenue;
  standing: OccasionStanding;
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
  /** Every viewable region of the place, the displayed one first. */
  regions: readonly RegionSummary[];
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
  /** Every viewable region of the place, the displayed one first. */
  regions: readonly RegionSummary[];
}>;

/** A region's detail as viewers see it: its own content. */
export type RegionDetail = Readonly<{
  regionId: RegionId;
  name: RegionName;
  tagline: Tagline | null;
  description: RegionDescription | null;
  address: Address;
  location: GeoPoint;
  /** Registration order; the first is the cover. */
  photos: readonly RegionPhoto[];
}>;

/** An occasion's detail as viewers see it: its content and holding status. */
export type OccasionDetail = Readonly<{
  occasionId: OccasionId;
  name: OccasionName;
  tagline: Tagline | null;
  description: OccasionDescription | null;
  period: DateRange;
  venue: CompleteVenue;
  /** Registration order; the first is the cover. */
  photos: readonly OccasionPhoto[];
  standing: OccasionStanding;
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
    regions: readonly RegionSummary[];
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
 * Viewable affiliated regions, the displayed region
 * (`PlaceAffiliations.displayedRegion`) first, then in first-affiliated
 * order; empty without affiliations or viewable affiliated regions
 * (P-15, P-16, B-25). `regions` may hold any regions; only affiliated
 * ones count.
 */
function regionsOf(
  affiliations: PlaceAffiliations | null,
  regions: readonly Region[],
): readonly PublishedRegion[] {
  if (affiliations === null) return [];
  const viewable = new Map(
    regions
      .filter(VisibilityPolicy.viewableRegion)
      .map((region) => [region.id, region] as const),
  );
  const affiliated = PlaceAffiliations.regionIds(affiliations).flatMap(
    (id) => viewable.get(id) ?? [],
  );
  const displayed = PlaceAffiliations.displayedRegion(
    affiliations,
    new Set(affiliated.map((region) => region.id)),
  );
  return [
    ...affiliated.filter((region) => region.id === displayed),
    ...affiliated.filter((region) => region.id !== displayed),
  ];
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

/**
 * `displayed`: the first of the entry's regions (none → no region name).
 * `within`: that region among the entry's regions.
 */
function regionLabel(
  entry: Pick<PlaceEntry, "regions">,
  context: RegionContext,
): PublishedRegion | null {
  const region =
    context.kind === "displayed"
      ? entry.regions[0]
      : entry.regions.find((r) => r.id === context.regionId);
  return region ?? null;
}

const regionNameOf = (
  entry: Pick<PlaceEntry, "regions">,
  context: RegionContext,
): RegionLabel | null => regionLabel(entry, context)?.content.name ?? null;

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
    region: regionNameOf(place, context),
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
    region: regionNameOf(entry, context),
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
    regions: place.regions.map(regionSummary),
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
    regions: entry.regions.map(regionSummary),
  };
}

function regionSummary(region: PublishedRegion): RegionSummary {
  const { content } = region;
  return {
    regionId: region.id,
    cover: {
      source: "own",
      photoId: content.photos.items[0].photoId,
      framing: null,
    },
    name: content.name,
    tagline: content.tagline,
    address: content.address,
    location: content.location,
  };
}

function occasionSummary(
  occasion: PublishedOccasion,
  today: LocalDate,
): OccasionSummary {
  const { content } = occasion;
  return {
    occasionId: occasion.id,
    cover: {
      source: "own",
      photoId: content.photos.items[0].photoId,
      framing: null,
    },
    name: content.name,
    tagline: content.tagline,
    period: content.period,
    venue: content.venue,
    standing: Standing.ofOccasion(occasion, today),
  };
}

function regionDetail(region: PublishedRegion): RegionDetail {
  const { content } = region;
  return {
    regionId: region.id,
    name: content.name,
    tagline: content.tagline,
    description: content.description,
    address: content.address,
    location: content.location,
    photos: content.photos.items,
  };
}

function occasionDetail(
  occasion: PublishedOccasion,
  today: LocalDate,
): OccasionDetail {
  const { content } = occasion;
  return {
    occasionId: occasion.id,
    name: content.name,
    tagline: content.tagline,
    description: content.description,
    period: content.period,
    venue: content.venue,
    photos: content.photos.items,
    standing: Standing.ofOccasion(occasion, today),
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
      region: regionNameOf(entry, { kind: "displayed" }),
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
      regions: entry.regions.map(regionSummary),
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
  regionSummary,
  occasionSummary,
  listingDetail,
  placeDetail,
  regionDetail,
  occasionDetail,
  previewListing,
  pickOtherListings,
  compareNewestListings,
};
