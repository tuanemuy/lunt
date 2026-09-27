import type { FramingRecord, ListingRecord } from "./listing";
import type { PlaceRecord } from "./place";
import type { QuerySpec } from "./queries";

export type SubstituteCoverRecord = Readonly<{
  listingId: string;
  photo: Readonly<{ photoId: string; framing: FramingRecord | null }>;
}>;

/**
 * A viewable place and its substitute cover. Region affiliations join in
 * stage 3; until then a place has none.
 */
export type PlaceEntryRecord = Readonly<{
  place: PlaceRecord;
  substituteCover: SubstituteCoverRecord | null;
}>;

/** A viewable (published) listing and its place's entry. */
export type ListingEntryRecord = Readonly<{
  listing: ListingRecord;
  place: PlaceEntryRecord;
}>;

export type RefRecord = Readonly<{ kind: string; id: string }>;

export type ReferenceResolutionRecord =
  | Readonly<{
      ref: RefRecord;
      viewable: true;
      target:
        | Readonly<{ kind: "listing"; entry: ListingEntryRecord }>
        | Readonly<{ kind: "place"; entry: PlaceEntryRecord }>;
    }>
  | Readonly<{ ref: RefRecord; viewable: false }>;

/**
 * Discovery's named reads on the Lunt state object. They read Place's and
 * Listing's tables read-only and apply `VisibilityPolicy` in the object
 * (`store/discovery.ts`). Discovery has no write commands.
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
  /**
   * The place's viewable listings the scene admits on `today`
   * (`YYYY-MM-DD`), in 「店舗の掲載の順」.
   */
  "discovery.findListingsOfPlace": QuerySpec<
    {
      placeId: string;
      scene: "discovery" | "reference";
      today: string;
      page: number;
      limit: number;
    },
    Readonly<{ items: readonly ListingEntryRecord[]; count: number }>
  >;
  /** One resolution per distinct ref (at most 100), in first-seen order. */
  "discovery.resolve": QuerySpec<
    { refs: readonly RefRecord[] },
    readonly ReferenceResolutionRecord[]
  >;
  "discovery.isViewable": QuerySpec<{ ref: RefRecord }, boolean>;
};

export type DiscoveryCommand = never;
