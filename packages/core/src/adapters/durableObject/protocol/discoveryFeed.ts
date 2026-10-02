import type { ListingEntryRecord } from "./discovery";
import type { OccasionRecord } from "./occasion";
import type { QuerySpec } from "./queries";
import type { RegionRecord } from "./region";

/**
 * A `FeedQuery` across RPC: `null` means no condition of that kind, an
 * empty list matches nothing. `categoryIds` are compared with the stored
 * category ids. Days are `YYYY-MM-DD`.
 */
export type FeedCriteriaRecord = Readonly<{
  areaCodes: readonly string[] | null;
  categoryIds: readonly string[] | null;
  origin: Readonly<{ latitude: number; longitude: number }> | null;
  today: string;
}>;

export type FeedQueryRecord = FeedCriteriaRecord &
  Readonly<{ page: number; limit: number }>;

/** A feed listing's id, its place's, and its displayed region (or `null`). */
export type FeedCandidateRecord = Readonly<{
  listingId: string;
  placeId: string;
  regionId: string | null;
}>;

type PageRecord<T> = Readonly<{ items: readonly T[]; count: number }>;

/**
 * The feed's candidate reads on the Lunt state object
 * (`store/discoveryFeed.ts`), in the discovery scene.
 */
export type DiscoveryFeedQueries = {
  "discovery.findFeedListings": QuerySpec<
    FeedQueryRecord,
    PageRecord<ListingEntryRecord>
  >;
  /** The first `upTo` feed listings in priority order, and the total. */
  "discovery.findFeedListingCandidates": QuerySpec<
    FeedCriteriaRecord & Readonly<{ upTo: number }>,
    Readonly<{ candidates: readonly FeedCandidateRecord[]; count: number }>
  >;
  "discovery.findFeedRegionFrames": QuerySpec<
    FeedQueryRecord,
    PageRecord<RegionRecord>
  >;
  "discovery.findFeedOccasionFrames": QuerySpec<
    FeedQueryRecord,
    PageRecord<OccasionRecord>
  >;
};
