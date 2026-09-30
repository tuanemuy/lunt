import type { ListListingsOfPlaceOutput } from "@repo/core/application/discovery/listListingsOfPlace";
import type { ListListingsOfRegionOutput } from "@repo/core/application/discovery/listListingsOfRegion";
import type { ListPlacesOfRegionOutput } from "@repo/core/application/discovery/listPlacesOfRegion";
import type { ViewListingOutput } from "@repo/core/application/discovery/viewListing";
import type { ViewOccasionOutput } from "@repo/core/application/discovery/viewOccasion";
import type { ViewPlaceOutput } from "@repo/core/application/discovery/viewPlace";
import type { ViewRegionOutput } from "@repo/core/application/discovery/viewRegion";
import type { PhotoRefs } from "@repo/core/application/discovery/views";
import { Address } from "@repo/core/domain/common/address";
import type { DateRange } from "@repo/core/domain/common/dateRange";
import type { PhotoId } from "@repo/core/domain/common/ids";
import type { ListingStanding } from "@repo/core/domain/discovery/standing";
import type {
  ListingPreview,
  ListingSummary,
  OccasionSummary,
  PlaceSummary,
  RegionSummary,
} from "@repo/core/domain/discovery/viewProjection";
import type { Offering } from "@repo/core/domain/listing/offering";
import type { Framing } from "@repo/core/domain/listing/values";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import type { HoldingStatus } from "@repo/core/domain/occasion/holdingStatus";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import type { PhotoSource } from "./photoFraming";

export type { HoldingStatus };

/**
 * What DT-01〜DT-04 show, as plain serializable data (`spec/pages/detail.md`).
 * Built on the server from the Discovery usecases' outputs; dates are
 * worded against the server's `today` so both renders agree.
 */

/** A photo with its alt text; `null` when the storage has no display ref. */
export type DetailPhoto = Readonly<{ photo: PhotoSource | null; alt: string }>;

/** How a listing is offered today, as DT-01 tells it. */
export type OfferingState =
  | Readonly<{ phase: "available" }>
  | Readonly<{ phase: "upcoming"; startsOn: string }>
  | Readonly<{ phase: "ended" }>;

/** A listing card (DiscoverCard): photo, name, place, region, state. */
export type ListingCardItem = Readonly<{
  listingId: string;
  name: string;
  placeName: string;
  /** The displayed region's name; `null` when the place shows none. */
  regionName: string | null;
  photo: PhotoSource | null;
  /** 提供開始前・… / 提供終了 for the reference scene; `null` while available. */
  state: string | null;
}>;

/** A region in a detail's region section (Lunt/ContentRow → DT-03). */
export type RegionRowItem = Readonly<{
  regionId: string;
  name: string;
  tagline: string | null;
  /** 市区町村・町域 of its address. */
  area: string;
  photo: PhotoSource | null;
}>;

/** An occasion in a detail's occasion section (Lunt/ContentRow → DT-04). */
export type OccasionRowItem = Readonly<{
  occasionId: string;
  name: string;
  tagline: string | null;
  periodText: string;
  holding: HoldingStatus;
  photo: PhotoSource | null;
}>;

/** A place in DT-03's place section and DT-04's participants (→ DT-02). */
export type PlaceRowItem = Readonly<{
  placeId: string;
  name: string;
  /** 市区町村・町域 of its address. */
  area: string;
  /** The region the list names (DT-03: that region; DT-04: the displayed one). */
  regionName: string | null;
  operating: OperatingStatus;
  photo: PhotoSource | null;
}>;

/**
 * DT-01's hero: the photos and what the listing says about itself, as
 * DT-01 shows it and CM-03 previews it. `name` and `categoryName` are
 * `null` only in a preview of a draft that lacks them.
 */
export type ListingHeroData = Readonly<{
  name: string | null;
  categoryName: string | null;
  description: string | null;
  photos: readonly DetailPhoto[];
  offering: OfferingState;
  offeringText: string | null;
  placeName: string;
  /** The place's displayed region; `null` while it has none viewers can see. */
  regionName: string | null;
  operating: OperatingStatus;
}>;

export type ListingDetailData = Readonly<{
  listingId: string;
  name: string;
  description: string | null;
  categoryName: string;
  /** Registration order; the first is the cover. */
  photos: readonly DetailPhoto[];
  offering: OfferingState;
  /** 提供期間 / 開催日 line when the offering is set. */
  offeringText: string | null;
  place: Readonly<{
    placeId: string;
    name: string;
    /** The displayed region's name. */
    regionName: string | null;
    operating: OperatingStatus;
  }>;
  otherListings: readonly ListingCardItem[];
  /** Every viewable region of the place, the displayed one first. */
  regions: readonly RegionRowItem[];
  /** Upcoming and ongoing occasions the listing is attached to (開催日の順). */
  occasions: readonly OccasionRowItem[];
  placeIsVacant: boolean;
}>;

export type PlaceDetailData = Readonly<{
  placeId: string;
  name: string;
  description: string | null;
  /** Registration order; empty for a place without photos (no substitute). */
  photos: readonly DetailPhoto[];
  address: string;
  businessHours: string | null;
  contact: string | null;
  operating: OperatingStatus;
  location: Readonly<{ latitude: number; longitude: number }>;
  /** Every viewable region of the place, the displayed one first. */
  regions: readonly RegionRowItem[];
  /** Upcoming and ongoing occasions the place takes part in (開催日の順). */
  occasions: readonly OccasionRowItem[];
  placeIsVacant: boolean;
  viewerIsSteward: boolean;
}>;

/** A page of DT-02's listing section (CF-05). */
export type PlaceListingsPage = Readonly<{
  items: readonly ListingCardItem[];
  count: number;
}>;

/** Listings per page of DT-02's listing section (「詳細の関連情報」: 6件). */
export const PLACE_LISTINGS_PAGE_SIZE = 6;

/** DT-01's 他の掲載: 6 in all (「詳細の関連情報」). */
export const OTHER_LISTINGS_LIMIT = 6;

/** DT-03's place and listing sections: 6 each, the rest in VW-06 (「詳細の関連情報」). */
export const REGION_SECTION_LIMIT = 6;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function dateParts(date: string): Readonly<{
  year: number;
  month: number;
  day: number;
}> {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return { year, month, day };
}

/**
 * `10月1日（木）`; the year leads when it is not `today`'s
 * (`2027年1月5日（火）`). Both are `YYYY-MM-DD` Japan-time days.
 */
export function formatDay(date: string, today: string): string {
  const { year, month, day } = dateParts(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const head = year === dateParts(today).year ? "" : `${year}年`;
  return `${head}${month}月${day}日（${WEEKDAYS[weekday]}）`;
}

/** The 提供期間 / 開催日 line of an offering, or `null` when none is set. */
export function offeringText(offering: Offering, today: string): string | null {
  switch (offering.kind) {
    case "none":
      return null;
    case "period": {
      const { start, end } = offering.period;
      const from = start === null ? "" : formatDay(start, today);
      const to = end === null ? "" : formatDay(end, today);
      if (start === null) return `提供期間　${to}まで`;
      if (end === null) return `提供期間　${from}から`;
      return `提供期間　${from}〜${to}`;
    }
    case "dates":
      return `開催日　${offering.dates.map((date) => formatDay(date, today)).join("、")}`;
  }
}

function offeringState(
  standing: ListingStanding,
  today: string,
): OfferingState {
  const { offering } = standing;
  switch (offering.phase) {
    case "available":
      return { phase: "available" };
    case "upcoming":
      return {
        phase: "upcoming",
        startsOn: formatDay(offering.startsOn, today),
      };
    case "ended":
      return { phase: "ended" };
  }
}

/** The label of an offering that is not available (提供開始前・10月1日（木）から / 提供終了). */
export function offeringLabel(state: OfferingState): string | null {
  switch (state.phase) {
    case "available":
      return null;
    case "upcoming":
      return `提供開始前・${state.startsOn}から`;
    case "ended":
      return "提供終了";
  }
}

const toFraming = (framing: Framing | null): PhotoSource["framing"] =>
  framing === null
    ? null
    : {
        x: framing.x,
        y: framing.y,
        width: framing.width,
        height: framing.height,
      };

function photoSource(
  refs: PhotoRefs,
  photoId: PhotoId,
  framing: Framing | null,
): PhotoSource | null {
  const ref = refs[photoId];
  return ref === undefined
    ? null
    : { src: ref.url, framing: toFraming(framing) };
}

/** A listing card of a summary, worded against `today`. */
export function listingCard(
  summary: ListingSummary,
  refs: PhotoRefs,
  today: string,
): ListingCardItem {
  return {
    listingId: summary.listingId,
    name: summary.listingName,
    placeName: summary.placeName,
    regionName: summary.region,
    photo: photoSource(refs, summary.cover.photoId, summary.cover.framing),
    state: offeringLabel(offeringState(summary.standing, today)),
  };
}

const localityText = (address: Address): string =>
  `${address.municipality}・${address.town}`;

/** A region row of a summary. */
export function regionRow(
  summary: RegionSummary,
  refs: PhotoRefs,
): RegionRowItem {
  return {
    regionId: summary.regionId,
    name: summary.name,
    tagline: summary.tagline,
    area: localityText(summary.address),
    photo: photoSource(refs, summary.cover.photoId, summary.cover.framing),
  };
}

const nextDay = (date: string): string => {
  const { year, month, day } = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
};

/**
 * A later day after an earlier one: without the month when both fall in
 * the same month (`18日（日）`), in full otherwise.
 */
function followingDay(previous: string, date: string, today: string): string {
  const a = dateParts(previous);
  const b = dateParts(date);
  const full = formatDay(date, today);
  return a.year === b.year && a.month === b.month
    ? full.slice(full.indexOf("月") + 1)
    : full;
}

/**
 * An occasion's period: `10月17日（土）` for one day,
 * `10月17日（土）・18日（日）` for two days in a row,
 * `10月10日（土）〜12日（月）` for more.
 */
export function periodText(period: DateRange, today: string): string {
  const { start, end } = period;
  const from = formatDay(start, today);
  if (start === end) return from;
  const joint = nextDay(start) === end ? "・" : "〜";
  return `${from}${joint}${followingDay(start, end, today)}`;
}

/** Participation days (ascending), each after the first shortened within its month. */
export function daysText(dates: readonly string[], today: string): string {
  return dates
    .map((date, index) => {
      const previous = dates[index - 1];
      return previous === undefined
        ? formatDay(date, today)
        : followingDay(previous, date, today);
    })
    .join("・");
}

/** An occasion row of a summary, its period worded against `today`. */
export function occasionRow(
  summary: OccasionSummary,
  refs: PhotoRefs,
  today: string,
): OccasionRowItem {
  return {
    occasionId: summary.occasionId,
    name: summary.name,
    tagline: summary.tagline,
    periodText: periodText(summary.period, today),
    holding: summary.standing.holding,
    photo: photoSource(refs, summary.cover.photoId, summary.cover.framing),
  };
}

/** A place row of a summary. */
export function placeRow(summary: PlaceSummary, refs: PhotoRefs): PlaceRowItem {
  return {
    placeId: summary.placeId,
    name: summary.name,
    area: localityText(summary.address),
    regionName: summary.region,
    operating: summary.standing.operating,
    photo:
      summary.cover === null
        ? null
        : photoSource(refs, summary.cover.photoId, summary.cover.framing),
  };
}

/** How viewers are told an occasion's holding status (開催前は開催予定). */
export const HOLDING_STATUS_TEXT = {
  upcoming: "開催予定",
  ongoing: "開催中",
  ended: "終了",
  cancelled: "中止",
} as const satisfies Readonly<Record<HoldingStatus, string>>;

/** DT-01's data from `viewListing`. */
export function toListingDetailData(
  output: ViewListingOutput,
  today: string,
): ListingDetailData {
  const { listing, photos } = output;
  return {
    listingId: listing.listingId,
    name: listing.name,
    description: listing.description,
    categoryName: listing.category.name,
    photos: listing.photos.map((photo, index) => ({
      photo: photoSource(photos, photo.photoId, photo.framing),
      alt: index === 0 ? listing.name : `${listing.name}（${index + 1}枚目）`,
    })),
    offering: offeringState(listing.standing, today),
    offeringText: offeringText(listing.offering, today),
    place: {
      placeId: listing.place.placeId,
      name: listing.place.name,
      regionName: listing.place.region,
      operating: listing.standing.operating,
    },
    otherListings: output.otherListings.map((summary) =>
      listingCard(summary, photos, today),
    ),
    regions: output.regions.map((region) => regionRow(region, photos)),
    occasions: output.occasions.map((occasion) =>
      occasionRow(occasion, photos, today),
    ),
    placeIsVacant: output.placeIsVacant,
  };
}

/** DT-01's hero of its data. */
export const listingHeroOf = (data: ListingDetailData): ListingHeroData => ({
  name: data.name,
  categoryName: data.categoryName,
  description: data.description,
  photos: data.photos,
  offering: data.offering,
  offeringText: data.offeringText,
  placeName: data.place.name,
  regionName: data.place.regionName,
  operating: data.place.operating,
});

/** What CM-03 shows of a listing: DT-01's hero and the list card. */
export type ListingPreviewViews = Readonly<{
  hero: ListingHeroData;
  card: ListingCardItem;
}>;

/**
 * CM-03's views of `previewListing`'s projection, mapped as DT-01 and the
 * cards map a published listing's.
 */
export function toListingPreviewViews(
  listingId: string,
  preview: ListingPreview,
  categoryName: string | null,
  refs: ReadonlyMap<PhotoId, PhotoDisplayRef>,
  today: string,
): ListingPreviewViews {
  const { detail, summary } = preview;
  const source = (
    photoId: PhotoId,
    framing: Framing | null,
  ): PhotoSource | null => {
    const ref = refs.get(photoId);
    return ref === undefined
      ? null
      : { src: ref.url, framing: toFraming(framing) };
  };
  const name = detail.name;
  const offering = offeringState(detail.standing, today);
  return {
    hero: {
      name,
      categoryName,
      description: detail.description,
      photos: detail.photos.map((photo, index) => ({
        photo: source(photo.photoId, photo.framing),
        alt:
          index === 0
            ? (name ?? "掲載")
            : `${name ?? "掲載"}（${index + 1}枚目）`,
      })),
      offering,
      offeringText: offeringText(detail.offering, today),
      placeName: detail.place.name,
      regionName: detail.place.region,
      operating: detail.standing.operating,
    },
    card: {
      listingId,
      name: summary.listingName ?? "名称未設定",
      placeName: summary.placeName,
      regionName: summary.region,
      photo:
        summary.cover === null
          ? null
          : source(summary.cover.photoId, summary.cover.framing),
      state: offeringLabel(offeringState(summary.standing, today)),
    },
  };
}

/** DT-02's data from `viewPlace`. */
export function toPlaceDetailData(
  output: ViewPlaceOutput,
  today: string,
): PlaceDetailData {
  const { place, photos } = output;
  return {
    placeId: place.placeId,
    name: place.name,
    description: place.description,
    photos: place.photos.map((photo, index) => ({
      photo: photoSource(photos, photo.photoId, null),
      alt: index === 0 ? place.name : `${place.name}（${index + 1}枚目）`,
    })),
    address: Address.text(place.address),
    businessHours: place.visitInfo.businessHours,
    contact: place.visitInfo.contact,
    operating: place.standing.operating,
    location: {
      latitude: place.location.latitude,
      longitude: place.location.longitude,
    },
    regions: output.regions.map((region) => regionRow(region, photos)),
    occasions: output.occasions.map((occasion) =>
      occasionRow(occasion, photos, today),
    ),
    placeIsVacant: output.placeIsVacant,
    viewerIsSteward: output.viewerIsSteward,
  };
}

/** A page of DT-02's listings from `listListingsOfPlace`. */
export function toPlaceListingsPage(
  output: ListListingsOfPlaceOutput,
  today: string,
): PlaceListingsPage {
  return {
    items: output.items.map((summary) =>
      listingCard(summary, output.photos, today),
    ),
    count: output.count,
  };
}

/** DT-03's first screen: the region, its occasions, and the first places and listings. */
export type RegionDetailData = Readonly<{
  regionId: string;
  name: string;
  tagline: string | null;
  description: string | null;
  /** 所在地: the full address, the part after the town included. */
  address: string;
  /** Registration order; the first is the cover. */
  photos: readonly DetailPhoto[];
  /** Linked upcoming and ongoing occasions (開催日の順). */
  occasions: readonly OccasionRowItem[];
  /** Newest affiliation first, up to `REGION_SECTION_LIMIT`; each names this region. */
  places: readonly PlaceRowItem[];
  placeCount: number;
  /** Newest first, up to `REGION_SECTION_LIMIT`; each names this region. */
  listings: readonly ListingCardItem[];
  listingCount: number;
}>;

/** DT-03's data from `viewRegion`, `listPlacesOfRegion` and `listListingsOfRegion`. */
export function toRegionDetailData(
  view: ViewRegionOutput,
  places: ListPlacesOfRegionOutput,
  listings: ListListingsOfRegionOutput,
  today: string,
): RegionDetailData {
  const { region, photos } = view;
  return {
    regionId: region.regionId,
    name: region.name,
    tagline: region.tagline,
    description: region.description,
    address: Address.text(region.address),
    photos: region.photos.map((photo, index) => ({
      photo: photoSource(photos, photo.photoId, null),
      alt: index === 0 ? region.name : `${region.name}（${index + 1}枚目）`,
    })),
    occasions: view.occasions.map((occasion) =>
      occasionRow(occasion, photos, today),
    ),
    places: places.items.map((place) => placeRow(place, places.photos)),
    placeCount: places.count,
    listings: listings.items.map((summary) =>
      listingCard(summary, listings.photos, today),
    ),
    listingCount: listings.count,
  };
}

/** A listing a participant attached, as DT-04 links it. */
export type AttachedListingItem = Readonly<{
  listingId: string;
  name: string;
  /** 提供開始前・… / 提供終了 (reference scene); `null` while available. */
  state: string | null;
}>;

/** One participant of DT-04: the place, its attached listings and days. */
export type ParticipantItem = Readonly<{
  place: PlaceRowItem;
  listings: readonly AttachedListingItem[];
  /** 参加日 within the current period; `null` when none is set. */
  daysText: string | null;
}>;

export type OccasionDetailData = Readonly<{
  occasionId: string;
  name: string;
  tagline: string | null;
  description: string | null;
  periodText: string;
  /** 開催場所: the venue's address. */
  venue: string;
  holding: HoldingStatus;
  /** Registration order; the first is the cover. */
  photos: readonly DetailPhoto[];
  /** In participation order. */
  participants: readonly ParticipantItem[];
  /** No participant has a viewable attached listing (CS-09). */
  hasNoViewableListing: boolean;
  /** Linked viewable regions, in link order. */
  regions: readonly RegionRowItem[];
  /**
   * 参加の申請 (RQ-06) is offered: the occasion is upcoming or ongoing and
   * the viewer is signed out or stewards a place (「詳細の手続きの入口」).
   */
  participationEntry: boolean;
}>;

/** DT-04's data from `viewOccasion`; `signedIn` whether it was read for a signed-in viewer. */
export function toOccasionDetailData(
  output: ViewOccasionOutput,
  today: string,
  signedIn: boolean,
): OccasionDetailData {
  const { occasion, photos } = output;
  return {
    occasionId: occasion.occasionId,
    name: occasion.name,
    tagline: occasion.tagline,
    description: occasion.description,
    periodText: periodText(occasion.period, today),
    venue: Address.text(occasion.venue.address),
    holding: occasion.standing.holding,
    photos: occasion.photos.map((photo, index) => ({
      photo: photoSource(photos, photo.photoId, null),
      alt: index === 0 ? occasion.name : `${occasion.name}（${index + 1}枚目）`,
    })),
    participants: output.participants.map((participant) => ({
      place: placeRow(participant.place, photos),
      listings: participant.listings.map((summary) => ({
        listingId: summary.listingId,
        name: summary.listingName,
        state: offeringLabel(offeringState(summary.standing, today)),
      })),
      daysText:
        participant.dates.length === 0
          ? null
          : daysText(participant.dates, today),
    })),
    hasNoViewableListing: output.hasNoViewableListing,
    regions: output.regions.map((region) => regionRow(region, photos)),
    participationEntry:
      (occasion.standing.holding === "upcoming" ||
        occasion.standing.holding === "ongoing") &&
      (!signedIn || output.viewerManagesPlace),
  };
}
