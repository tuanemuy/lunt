import type { QuerySpec } from "./queries";

/**
 * At-rest shape of a region (`Region.snapshot` with times as epoch
 * milliseconds). Values pass through the store unchecked; the request
 * side's `Region.reconstruct` rejects invalid ones as data-integrity
 * failures.
 */
export type RegionRecord = Readonly<{
  id: string;
  publication: Readonly<{
    status: string;
    firstPublishedAt: number | null;
    reason: string | null;
  }>;
  suspended: boolean;
  content: Readonly<{
    name: string | null;
    address: Readonly<{
      areaCode: string;
      prefecture: string;
      municipality: string;
      town: string;
      rest: string;
    }> | null;
    location: Readonly<{ latitude: number; longitude: number }> | null;
    /** In display order; the first is the cover. */
    photoIds: readonly string[];
    photosTakenDown: boolean;
    description: string | null;
    tagline: string | null;
  }>;
  updatedAt: number;
  version: number;
}>;

/** At-rest shape of a place's affiliations; `affiliatedAt` in epoch ms. */
export type PlaceAffiliationsRecord = Readonly<{
  placeId: string;
  /** First-affiliated order. */
  affiliations: readonly Readonly<{ regionId: string; affiliatedAt: number }>[];
  chosenRepresentative: string | null;
  updatedAt: number;
  version: number;
}>;

type Paged = Readonly<{ page: number; limit: number }>;

/**
 * Region's named reads and write commands on the Lunt state object. The
 * handler tables in `store/region.ts` cover every one.
 */
export type RegionQueries = {
  "region.findById": QuerySpec<{ id: string }, RegionRecord | null>;
  /** Stored regions among `ids` (at most 100), any state, in id order. */
  "region.findByIds": QuerySpec<
    { ids: readonly string[] },
    readonly RegionRecord[]
  >;
  /** `terms` are a `SearchKeyword`'s normalised terms. */
  "region.searchForOperation": QuerySpec<
    Paged & { terms: readonly string[] },
    Readonly<{ items: readonly RegionRecord[]; count: number }>
  >;
  "region.findPlaceAffiliations": QuerySpec<
    { placeId: string },
    PlaceAffiliationsRecord | null
  >;
  /** Place ids affiliated with the region, newest affiliation first, then id. */
  "region.findAffiliatedPlaces": QuerySpec<
    Paged & { regionId: string },
    Readonly<{ items: readonly string[]; count: number }>
  >;
};

export type RegionCommand =
  | Readonly<{ kind: "region.insert"; record: RegionRecord }>
  | Readonly<{
      kind: "region.save";
      record: RegionRecord;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "region.insertPlaceAffiliations";
      record: PlaceAffiliationsRecord;
    }>
  | Readonly<{
      kind: "region.savePlaceAffiliations";
      record: PlaceAffiliationsRecord;
      expectedVersion: number;
    }>;
