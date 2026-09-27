import type { ListListingsOfPlaceOutput } from "@repo/core/application/discovery/listListingsOfPlace";
import type { ViewListingOutput } from "@repo/core/application/discovery/viewListing";
import type { ViewPlaceOutput } from "@repo/core/application/discovery/viewPlace";
import type { PhotoRefs } from "@repo/core/application/discovery/views";
import { Address } from "@repo/core/domain/common/address";
import type { PhotoId } from "@repo/core/domain/common/ids";
import type { ListingStanding } from "@repo/core/domain/discovery/standing";
import type { ListingSummary } from "@repo/core/domain/discovery/viewProjection";
import type { Offering } from "@repo/core/domain/listing/offering";
import type { Framing } from "@repo/core/domain/listing/values";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import type { PhotoSource } from "./photoFraming";

/**
 * What DT-01 / DT-02 show, as plain serializable data (`spec/pages/detail.md`).
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
  /** The displayed region's name; none before regions exist (stage 3). */
  regionName: string | null;
  photo: PhotoSource | null;
  /** 提供開始前・… / 提供終了 for the reference scene; `null` while available. */
  state: string | null;
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
    operating: OperatingStatus;
  }>;
  otherListings: readonly ListingCardItem[];
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

function listingCard(
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
      operating: listing.standing.operating,
    },
    otherListings: output.otherListings.map((summary) =>
      listingCard(summary, photos, today),
    ),
    placeIsVacant: output.placeIsVacant,
  };
}

/** DT-02's data from `viewPlace`. */
export function toPlaceDetailData(output: ViewPlaceOutput): PlaceDetailData {
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

/** 営業状況 as DT-02's お店のこと states it. */
export const OPERATING_TEXT: Readonly<Record<OperatingStatus, string>> = {
  open: "営業中",
  temporarilyClosed: "休業中",
  permanentlyClosed: "閉店",
};
