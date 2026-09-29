import type { FramingRecord, ListingRecord } from "./listing";
import type { OccasionRecord, ParticipationRecord } from "./occasion";
import type { PlaceRecord } from "./place";
import type { QuerySpec } from "./queries";
import type { PlaceAffiliationsRecord, RegionRecord } from "./region";

export type SubstituteCoverRecord = Readonly<{
  listingId: string;
  photo: Readonly<{ photoId: string; framing: FramingRecord | null }>;
}>;

/**
 * A viewable place, its affiliations and its viewable affiliated regions
 * (in any order: the request side orders them with
 * `ViewProjection.regionsOf`), and its substitute cover.
 */
export type PlaceEntryRecord = Readonly<{
  place: PlaceRecord;
  affiliations: PlaceAffiliationsRecord | null;
  regions: readonly RegionRecord[];
  substituteCover: SubstituteCoverRecord | null;
}>;

/** A viewable (published) listing and its place's entry. */
export type ListingEntryRecord = Readonly<{
  listing: ListingRecord;
  place: PlaceEntryRecord;
}>;

/** A viewable participant and its viewable attached listings in attach order. */
export type ParticipantEntryRecord = Readonly<{
  place: PlaceEntryRecord;
  participation: ParticipationRecord;
  listings: readonly ListingRecord[];
}>;

export type RefRecord = Readonly<{ kind: string; id: string }>;

export type ResolvedTargetRecord =
  | Readonly<{ kind: "listing"; entry: ListingEntryRecord }>
  | Readonly<{ kind: "place"; entry: PlaceEntryRecord }>
  | Readonly<{ kind: "region"; region: RegionRecord }>
  | Readonly<{ kind: "occasion"; occasion: OccasionRecord }>;

export type ReferenceResolutionRecord =
  | Readonly<{ ref: RefRecord; viewable: true; target: ResolvedTargetRecord }>
  | Readonly<{ ref: RefRecord; viewable: false }>;

export type ScoredRecord<T> = Readonly<{ entry: T; relevance: number }>;

type Paged = Readonly<{ page: number; limit: number }>;
type PageRecord<T> = Readonly<{ items: readonly T[]; count: number }>;

/**
 * Discovery's named reads on the Lunt state object. They read Place's,
 * Listing's, Region's, Occasion's and Authority's tables read-only and
 * apply `VisibilityPolicy` in the object (`store/discovery.ts`). Days are
 * `YYYY-MM-DD`. Discovery has no write commands.
 */
export type DiscoveryQueries = {
  /** The viewable listing, else `null`. */
  "discovery.findListing": QuerySpec<
    { listingId: string },
    ListingEntryRecord | null
  >;
  /** The viewable place, else `null`. */
  "discovery.findPlace": QuerySpec<
    { placeId: string },
    PlaceEntryRecord | null
  >;
  /** The viewable region, else `null`. */
  "discovery.findRegion": QuerySpec<{ regionId: string }, RegionRecord | null>;
  /** The viewable occasion, else `null`. */
  "discovery.findOccasion": QuerySpec<
    { occasionId: string },
    OccasionRecord | null
  >;
  /**
   * The place's viewable listings the scene admits on `today`, in
   * 「店舗の掲載の順」.
   */
  "discovery.findListingsOfPlace": QuerySpec<
    Paged & {
      placeId: string;
      scene: "discovery" | "reference";
      today: string;
    },
    PageRecord<ListingEntryRecord>
  >;
  /** Upcoming and ongoing viewable occasions of the subject, in 「開催日の順」. */
  "discovery.findOccasionsRelatedTo": QuerySpec<
    {
      subject: Readonly<{ kind: "listing" | "place" | "region"; id: string }>;
      today: string;
    },
    readonly OccasionRecord[]
  >;
  /** A viewable occasion's viewable participants, in participation order. */
  "discovery.findParticipants": QuerySpec<
    { occasionId: string },
    readonly ParticipantEntryRecord[]
  >;
  /** A viewable occasion's viewable `linked` regions, in link order. */
  "discovery.findRegionsOfOccasion": QuerySpec<
    { occasionId: string },
    readonly RegionRecord[]
  >;
  /** A viewable region's discoverable places, newest affiliation first. */
  "discovery.findPlacesOfRegion": QuerySpec<
    Paged & { regionId: string },
    PageRecord<PlaceEntryRecord>
  >;
  /** A viewable region's discoverable listings on `today`, newest first. */
  "discovery.findListingsOfRegion": QuerySpec<
    Paged & {
      regionId: string;
      excludingPlaceId: string | null;
      today: string;
    },
    PageRecord<ListingEntryRecord>
  >;
  /** `terms` are a `SearchKeyword`'s normalised terms. */
  "discovery.searchPlaces": QuerySpec<
    Paged & { terms: readonly string[]; vacantOnly: boolean },
    PageRecord<ScoredRecord<PlaceEntryRecord>>
  >;
  "discovery.searchListings": QuerySpec<
    Paged & { terms: readonly string[] },
    PageRecord<ScoredRecord<ListingEntryRecord>>
  >;
  "discovery.searchRegions": QuerySpec<
    Paged & { terms: readonly string[] },
    PageRecord<ScoredRecord<RegionRecord>>
  >;
  "discovery.searchOccasions": QuerySpec<
    Paged & { terms: readonly string[]; openOnly: boolean; today: string },
    PageRecord<ScoredRecord<OccasionRecord>>
  >;
  /** One resolution per distinct ref (at most 100), in first-seen order. */
  "discovery.resolve": QuerySpec<
    { refs: readonly RefRecord[] },
    readonly ReferenceResolutionRecord[]
  >;
  "discovery.isViewable": QuerySpec<{ ref: RefRecord }, boolean>;
};

export type DiscoveryCommand = never;
