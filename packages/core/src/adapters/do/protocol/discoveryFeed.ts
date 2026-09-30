import type { ListingEntryRecord } from "./discovery";
import type { OccasionRecord } from "./occasion";
import type { QuerySpec } from "./queries";
import type { RegionRecord } from "./region";

/**
 * A `FeedQuery` across RPC: `null` means no condition of that kind, an
 * empty list matches nothing. `categoryIds` are compared with the stored
 * category ids. Days are `YYYY-MM-DD`.
 */
export type FeedQueryRecord = Readonly<{
  areaCodes: readonly string[] | null;
  categoryIds: readonly string[] | null;
  origin: Readonly<{ latitude: number; longitude: number }> | null;
  today: string;
  page: number;
  limit: number;
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
  "discovery.findFeedRegionFrames": QuerySpec<
    FeedQueryRecord,
    PageRecord<RegionRecord>
  >;
  "discovery.findFeedOccasionFrames": QuerySpec<
    FeedQueryRecord,
    PageRecord<OccasionRecord>
  >;
};
