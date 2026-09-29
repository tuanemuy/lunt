import type { QuerySpec } from "./queries";

/** At-rest shape of an occasion (`Occasion.snapshot`); days are `YYYY-MM-DD`. */
export type OccasionRecord = Readonly<{
  id: string;
  publication: Readonly<{
    status: string;
    firstPublishedAt: Date | null;
    reason: string | null;
  }>;
  suspended: boolean;
  cancelled: boolean;
  content: Readonly<{
    name: string | null;
    period: Readonly<{ start: string; end: string }> | null;
    venue: Readonly<{
      address: Readonly<{
        areaCode: string;
        prefecture: string;
        municipality: string;
        town: string;
        rest: string;
      }> | null;
      location: Readonly<{ latitude: number; longitude: number }> | null;
    }>;
    photoIds: readonly string[];
    photosTakenDown: boolean;
    description: string | null;
    tagline: string | null;
  }>;
  updatedAt: Date;
  version: number;
}>;

/** At-rest shape of a participation (`Participation.snapshot`). */
export type ParticipationRecord = Readonly<{
  occasionId: string;
  placeId: string;
  listingIds: readonly string[];
  dates: readonly string[];
  participatedAt: Date;
  updatedAt: Date;
  version: number;
}>;

/** At-rest shape of a region link (`RegionLink.snapshot`). */
export type RegionLinkRecord = Readonly<{
  occasionId: string;
  regionId: string;
  status: string;
  linkedAt: Date;
  updatedAt: Date;
  version: number;
}>;

export type HoldingStatusRecordRecord = Readonly<{
  occasionId: string;
  lastObserved: string | null;
  observedVersion: number;
  nextChangeOn: string | null;
}>;

export type Page<T> = Readonly<{ items: readonly T[]; count: number }>;

type Paged = Readonly<{ page: number; limit: number }>;

type PairOfPlace = Readonly<{ occasionId: string; placeId: string }>;
type PairOfRegion = Readonly<{ occasionId: string; regionId: string }>;

/**
 * Occasion's named reads and write commands on the Lunt state object. The
 * handler tables in `store/occasion.ts` cover every one.
 */
export type OccasionQueries = {
  "occasion.findById": QuerySpec<{ id: string }, OccasionRecord | null>;
  /** Stored occasions among `ids` (at most 100). */
  "occasion.findByIds": QuerySpec<
    { ids: readonly string[] },
    readonly OccasionRecord[]
  >;
  /** `terms` are a `SearchKeyword`'s normalised terms. */
  "occasion.searchForOperation": QuerySpec<
    Paged & { terms: readonly string[] },
    Page<OccasionRecord>
  >;
  "occasion.findParticipation": QuerySpec<
    PairOfPlace,
    ParticipationRecord | null
  >;
  "occasion.findParticipationsByOccasion": QuerySpec<
    Paged & { occasionId: string },
    Page<ParticipationRecord>
  >;
  "occasion.findParticipationsByPlace": QuerySpec<
    Paged & { placeId: string },
    Page<ParticipationRecord>
  >;
  "occasion.findRegionLink": QuerySpec<PairOfRegion, RegionLinkRecord | null>;
  "occasion.findRegionLinksByOccasion": QuerySpec<
    Paged & { occasionId: string },
    Page<RegionLinkRecord>
  >;
  "occasion.findRegionLinksByRegion": QuerySpec<
    Paged & { regionId: string },
    Page<RegionLinkRecord>
  >;
  "occasion.findToObserve": QuerySpec<
    Paged & { today: string },
    Page<
      Readonly<{
        occasion: OccasionRecord;
        record: HoldingStatusRecordRecord | null;
      }>
    >
  >;
  /** The record of an existing occasion; `null` otherwise. */
  "occasion.findHoldingStatus": QuerySpec<
    { occasionId: string },
    HoldingStatusRecordRecord | null
  >;
};

export type OccasionCommand =
  | Readonly<{ kind: "occasion.insert"; record: OccasionRecord }>
  | Readonly<{
      kind: "occasion.save";
      record: OccasionRecord;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "occasion.insertParticipation";
      record: ParticipationRecord;
    }>
  | Readonly<{
      kind: "occasion.saveParticipation";
      record: ParticipationRecord;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "occasion.deleteParticipation";
      key: PairOfPlace;
      expectedVersion: number;
    }>
  | Readonly<{ kind: "occasion.insertRegionLink"; record: RegionLinkRecord }>
  | Readonly<{
      kind: "occasion.saveRegionLink";
      record: RegionLinkRecord;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "occasion.deleteRegionLink";
      key: PairOfRegion;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "occasion.putHoldingStatus";
      record: HoldingStatusRecordRecord;
    }>;
