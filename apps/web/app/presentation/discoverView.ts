import type {
  FeedEntry,
  ReadFeedOutput,
} from "@repo/core/application/discovery/readFeed";
import type {
  SearchByKeywordOutput,
  SearchKind,
  SearchPage,
} from "@repo/core/application/discovery/searchByKeyword";
import type { PhotoRefs } from "@repo/core/application/discovery/views";
import type {
  ListingSummary,
  OccasionSummary,
  PlaceSummary,
  RegionSummary,
} from "@repo/core/domain/discovery/viewProjection";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import {
  HOLDING_STATUS_TEXT,
  type HoldingStatus,
  type ListingCardItem,
  listingCard,
  type OccasionRowItem,
  occasionRow,
  type PlaceRowItem,
  placeRow,
  type RegionRowItem,
  regionRow,
} from "./detailView";
import type { ConditionItem } from "./exploreView";

/**
 * What VW-01 みつける and VW-03 検索 show, as plain serializable data built
 * on the server from `readFeed` and `searchByKeyword`
 * (`spec/pages/browse.md`). VW-02 絞り込み reuses the area lookups of
 * `presentation/area.ts`.
 */

/** Feed listings per page: a multiple of the frame interval (6) and of the 2 / 3 / 4 columns. */
export const FEED_PAGE_SIZE = 24;

/**
 * How deep the feed can be read: every page is composed from the head of
 * the candidates, so a deep page reads the whole prefix on the one state
 * object. The feed ends here (CF-05's end) rather than paging on.
 */
export const FEED_MAX_LISTINGS = 2000;
export const FEED_MAX_PAGE = Math.floor(FEED_MAX_LISTINGS / FEED_PAGE_SIZE);

/** Results per kind and page of VW-03. */
export const SEARCH_PAGE_SIZE = 20;

/** 休業中 / 閉店 of a place, `null` while it operates. */
export function closureText(operating: OperatingStatus): string | null {
  switch (operating) {
    case "temporarilyClosed":
      return "休業中";
    case "permanentlyClosed":
      return "閉店";
    case "open":
      return null;
  }
}

/** A listing card of the feed; `saved` is the account's answer when signed in. */
export type FeedListingItem = Readonly<{
  kind: "listing";
  card: ListingCardItem;
  saved: boolean;
}>;

/** The region frame (EditorialFeature): photo, name, tagline, locality. */
export type FeedRegionItem = Readonly<{
  kind: "region";
  region: RegionRowItem;
}>;

/** The occasion frame: photo, name, tagline, venue, period and holding status. */
export type FeedOccasionItem = Readonly<{
  kind: "occasion";
  occasion: OccasionRowItem & Readonly<{ venue: string; holdingText: string }>;
}>;

export type FeedItem = FeedListingItem | FeedRegionItem | FeedOccasionItem;

/** One kind-prefixed key per item (`listing:{id}`, `region:{id}`, `occasion:{id}`). */
export function feedItemKey(item: FeedItem): string {
  switch (item.kind) {
    case "listing":
      return `listing:${item.card.listingId}`;
    case "region":
      return `region:${item.region.regionId}`;
    case "occasion":
      return `occasion:${item.occasion.occasionId}`;
  }
}

/**
 * A page of the feed (CF-05): items in feed order and the matching
 * listings' count, up to the `FEED_MAX_PAGE` pages the feed reads.
 */
export type FeedPage = Readonly<{
  items: readonly FeedItem[];
  count: number;
}>;

/**
 * VW-01's first screen: the first page, whether the viewer is signed in
 * (the account decides the save toggles, else the device), the chosen
 * conditions (CF-03), the active categories (the ジャンル tabs) and the
 * categories in force.
 */
export type FeedScreen = Readonly<{
  first: FeedPage;
  signedIn: boolean;
  conditions: readonly ConditionItem[];
  categories: readonly Readonly<{ id: string; name: string }>[];
  /** The effective conditions: retired categories and repeats dropped. */
  filtered: boolean;
  categoryIds: readonly string[];
}>;

const venueText = (summary: OccasionSummary): string =>
  `${summary.venue.address.municipality}・${summary.venue.address.town}`;

/** The feed card of a listing: 休業中 in place of the offering (the discovery scene shows available listings only). */
function feedCard(
  summary: ListingSummary,
  refs: PhotoRefs,
  today: string,
): ListingCardItem {
  const card = listingCard(summary, refs, today);
  return {
    ...card,
    state: closureText(summary.standing.operating) ?? card.state,
  };
}

function holdingText(holding: HoldingStatus): string {
  return HOLDING_STATUS_TEXT[holding];
}

/** A feed page of `readFeed`, worded against `today`; `saved` lists the account's saved listing ids. */
export function toFeedPage(
  output: ReadFeedOutput,
  today: string,
  saved: ReadonlySet<string>,
): FeedPage {
  const item = (entry: FeedEntry): FeedItem => {
    switch (entry.kind) {
      case "listing":
        return {
          kind: "listing",
          card: feedCard(entry.summary, output.photos, today),
          saved: saved.has(entry.summary.listingId),
        };
      case "region":
        return {
          kind: "region",
          region: regionRow(entry.summary, output.photos),
        };
      case "occasion":
        return {
          kind: "occasion",
          occasion: {
            ...occasionRow(entry.summary, output.photos, today),
            venue: venueText(entry.summary),
            holdingText: holdingText(entry.summary.standing.holding),
          },
        };
    }
  };
  return {
    items: output.items.map(item),
    count: Math.min(output.listingCount, FEED_MAX_PAGE * FEED_PAGE_SIZE),
  };
}

/** The listing ids of a feed page (the save toggles' targets). */
export const feedListingIds = (output: ReadFeedOutput): readonly string[] =>
  output.items.flatMap((entry) =>
    entry.kind === "listing" ? [entry.summary.listingId] : [],
  );

/** A place result: the row of a detail and its locality. */
export type SearchPlaceItem = Readonly<{ kind: "place"; place: PlaceRowItem }>;
export type SearchRegionItem = Readonly<{
  kind: "region";
  region: RegionRowItem;
}>;
/** A listing result: the card's fields, its offering state and its place's closure. */
export type SearchListingItem = Readonly<{
  kind: "listing";
  card: ListingCardItem;
  closure: string | null;
}>;
export type SearchOccasionItem = Readonly<{
  kind: "occasion";
  occasion: OccasionRowItem & Readonly<{ venue: string }>;
}>;

export type SearchItem =
  | SearchPlaceItem
  | SearchRegionItem
  | SearchListingItem
  | SearchOccasionItem;

export function searchItemKey(item: SearchItem): string {
  switch (item.kind) {
    case "place":
      return item.place.placeId;
    case "region":
      return item.region.regionId;
    case "listing":
      return item.card.listingId;
    case "occasion":
      return item.occasion.occasionId;
  }
}

/** One kind's page of results (CF-05 per kind). */
export type SearchGroupPage = Readonly<{
  items: readonly SearchItem[];
  count: number;
}>;

export type SearchGroup = Readonly<{
  kind: SearchKind;
  first: SearchGroupPage;
}>;

/** VW-03's results: the kinds with results, in `SEARCH_KINDS` order. */
export type SearchScreen = Readonly<{
  keyword: string;
  groups: readonly SearchGroup[];
}>;

/**
 * `SEARCH_KINDS` for the browser (the usecase module stays on the server):
 * the kinds in the order the results show them.
 */
export const SEARCH_KIND_ORDER = [
  "place",
  "region",
  "listing",
  "occasion",
] as const satisfies readonly SearchKind[];

/** The heading of a kind's results (design VW-03). */
export const SEARCH_KIND_LABEL = {
  place: "お店",
  region: "まち",
  listing: "見つかるもの",
  occasion: "イベント",
} as const satisfies Readonly<Record<SearchKind, string>>;

const placeItem = (summary: PlaceSummary, refs: PhotoRefs): SearchItem => ({
  kind: "place",
  place: placeRow(summary, refs),
});

const regionItem = (summary: RegionSummary, refs: PhotoRefs): SearchItem => ({
  kind: "region",
  region: regionRow(summary, refs),
});

const listingItem = (
  summary: ListingSummary,
  refs: PhotoRefs,
  today: string,
): SearchItem => ({
  kind: "listing",
  card: listingCard(summary, refs, today),
  closure: closureText(summary.standing.operating),
});

const occasionItem = (
  summary: OccasionSummary,
  refs: PhotoRefs,
  today: string,
): SearchItem => ({
  kind: "occasion",
  occasion: {
    ...occasionRow(summary, refs, today),
    venue: venueText(summary),
  },
});

function groupPage<T>(
  page: SearchPage<T> | null,
  toItem: (summary: T) => SearchItem,
): SearchGroupPage | null {
  return page === null
    ? null
    : { items: page.items.map(toItem), count: page.count };
}

/** Each kind read by `searchByKeyword`, as pages (`null` for a kind not read). */
export function toSearchPages(
  output: SearchByKeywordOutput,
  today: string,
): Readonly<Record<SearchKind, SearchGroupPage | null>> {
  const { results, photos } = output;
  return {
    place: groupPage(results.place, (s) => placeItem(s, photos)),
    region: groupPage(results.region, (s) => regionItem(s, photos)),
    listing: groupPage(results.listing, (s) => listingItem(s, photos, today)),
    occasion: groupPage(results.occasion, (s) =>
      occasionItem(s, photos, today),
    ),
  };
}

/** Whether a string is empty or white space only (full-width spaces included): 「キーワード未入力」. */
export const isBlankKeyword = (value: string): boolean =>
  /^[\s　]*$/u.test(value);

/** A chosen area as VW-02 carries it: its `area` code and the name it shows. */
export type ChosenArea = Readonly<{ code: string; label: string }>;

/** VW-02's start (CS-01 covers reading it). */
export type FilterScreen = Readonly<{
  prefectures: readonly Readonly<{ code: string; name: string }>[];
  categories: readonly Readonly<{ id: string; name: string }>[];
  areas: readonly ChosenArea[];
  categoryIds: readonly string[];
}>;
