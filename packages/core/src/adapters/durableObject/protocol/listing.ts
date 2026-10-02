import type { QuerySpec } from "./queries";

export type FramingRecord = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type OfferingRecord =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "period"; start: string | null; end: string | null }>
  | Readonly<{ kind: "dates"; dates: readonly string[] }>;

/** At-rest shape of a listing (`Listing.snapshot`); days are `YYYY-MM-DD`. */
export type ListingRecord = Readonly<{
  id: string;
  placeId: string;
  publication: Readonly<{
    status: string;
    firstPublishedAt: Date | null;
    reason: string | null;
  }>;
  suspended: boolean;
  /** `null` for a draft. */
  manualEnded: boolean | null;
  content: Readonly<{
    name: string | null;
    description: string | null;
    categoryId: string | null;
    photos: readonly Readonly<{
      photoId: string;
      framing: FramingRecord | null;
    }>[];
    photosTakenDown: boolean;
    offering: OfferingRecord;
  }>;
  updatedAt: Date;
  version: number;
}>;

/**
 * The days that bound a listing's offering phases, computed on the request
 * side by `Offering.startsOn` / `Offering.lastAvailableOn` from the same
 * snapshot, so the object compares days without holding the rule.
 */
export type ListingScheduleRecord = Readonly<{
  startsOn: string | null;
  lastAvailableOn: string | null;
}>;

export type ListingPage = Readonly<{
  items: readonly ListingRecord[];
  count: number;
}>;

export type ListingShelfRecord = Readonly<{
  publication: string | null;
  phase: string | null;
}>;

export type ListingShelfCountsRecord = Readonly<{
  publication: Readonly<{ published: number; draft: number; hidden: number }>;
  phase: Readonly<{ upcoming: number; available: number; ended: number }>;
}>;

export type CategoryCatalogRecord = Readonly<{
  categories: readonly Readonly<{
    id: string;
    name: string;
    status: string;
    successorId: string | null;
  }>[];
  updatedAt: Date;
  version: number;
}>;

export type OfferingPhaseRecordRecord = Readonly<{
  listingId: string;
  phase: string;
  observedVersion: number;
  nextChangeOn: string | null;
}>;

export type DriftedListingPage = Readonly<{
  items: readonly Readonly<{
    listing: ListingRecord;
    recorded: string | null;
  }>[];
  count: number;
}>;

type Paged = Readonly<{ page: number; limit: number }>;

/**
 * Listing's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/listing.ts` must cover every one.
 */
export type ListingQueries = {
  "listing.findById": QuerySpec<{ id: string }, ListingRecord | null>;
  "listing.isDeleted": QuerySpec<{ id: string }, boolean>;
  /** Stored listings among `ids` (at most 100). */
  "listing.findByIds": QuerySpec<
    { ids: readonly string[] },
    readonly ListingRecord[]
  >;
  "listing.findPageByPlace": QuerySpec<
    Paged & { placeId: string; shelf: ListingShelfRecord; today: string },
    ListingPage
  >;
  "listing.countByPlace": QuerySpec<
    { placeId: string; today: string },
    ListingShelfCountsRecord
  >;
  "listing.findPageAttachable": QuerySpec<
    Paged & { placeId: string },
    ListingPage
  >;
  /** Any number of category ids. */
  "listing.findPageByCategories": QuerySpec<
    Paged & { categoryIds: readonly string[] },
    ListingPage
  >;
  /** `terms` are a `SearchKeyword`'s normalised terms. */
  "listing.searchForOperation": QuerySpec<
    Paged & { terms: readonly string[] },
    ListingPage
  >;
  "listing.findCategoryCatalog": QuerySpec<
    Record<string, never>,
    CategoryCatalogRecord | null
  >;
  "listing.findDrifted": QuerySpec<
    Paged & { today: string },
    DriftedListingPage
  >;
  /** The record of an existing listing; `null` otherwise. */
  "listing.findOfferingPhase": QuerySpec<
    { listingId: string },
    OfferingPhaseRecordRecord | null
  >;
};

export type ListingCommand =
  | Readonly<{
      kind: "listing.insert";
      record: ListingRecord;
      schedule: ListingScheduleRecord;
    }>
  | Readonly<{
      kind: "listing.save";
      record: ListingRecord;
      schedule: ListingScheduleRecord;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "listing.delete";
      id: string;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "listing.saveCategoryCatalog";
      record: CategoryCatalogRecord;
      /** `null`: save only while no catalog is stored. */
      expectedVersion: number | null;
    }>
  | Readonly<{
      kind: "listing.recordOfferingPhase";
      record: OfferingPhaseRecordRecord;
    }>
  | Readonly<{ kind: "listing.removeOfferingPhase"; listingId: string }>;
