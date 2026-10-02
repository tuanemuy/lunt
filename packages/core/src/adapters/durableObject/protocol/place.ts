import type { QuerySpec } from "./queries";

/**
 * At-rest shape of a place (`Place.snapshot` with times as epoch
 * milliseconds). Values pass through the store unchecked; the request
 * side's `Place.reconstruct` rejects invalid ones as data-integrity
 * failures.
 */
export type PlaceRecord = Readonly<{
  id: string;
  name: string;
  /** In display order; the first is the cover. */
  photoIds: readonly string[];
  photosTakenDown: boolean;
  description: string | null;
  address: Readonly<{
    areaCode: string;
    prefecture: string;
    municipality: string;
    town: string;
    rest: string;
  }>;
  location: Readonly<{ latitude: number; longitude: number }>;
  businessHours: string | null;
  contact: string | null;
  operatingStatus: string;
  suspended: boolean;
  registeredAt: number;
  updatedAt: number;
  version: number;
}>;

/**
 * Place's named reads and write commands on the Lunt state object. The
 * handler tables in `store/place.ts` cover every one.
 */
export type PlaceQueries = {
  "place.findById": QuerySpec<{ id: string }, PlaceRecord | null>;
  /** Existing places among `ids` (at most 100), suspended included, in id order. */
  "place.findByIds": QuerySpec<
    { ids: readonly string[] },
    readonly PlaceRecord[]
  >;
  /**
   * `PlaceMatching.matchesFields` over every stored place, by
   * `PlaceMatching.relevanceOf` descending then id; `name` / `address`
   * are the criteria's normalized terms (`null`: not entered).
   */
  "place.match": QuerySpec<
    {
      name: string | null;
      address: string | null;
      includeSuspended: boolean;
      page: number;
      limit: number;
    },
    Readonly<{ items: readonly PlaceRecord[]; count: number }>
  >;
};

export type PlaceCommand =
  | Readonly<{ kind: "place.insert"; record: PlaceRecord }>
  | Readonly<{
      kind: "place.save";
      record: PlaceRecord;
      expectedVersion: number;
    }>;
