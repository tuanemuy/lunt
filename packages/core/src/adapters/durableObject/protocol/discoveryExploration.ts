import type { PlaceEntryRecord } from "./discovery";
import type { OccasionRecord } from "./occasion";
import type { QuerySpec } from "./queries";
import type { RegionRecord } from "./region";

export type GeoPointRecord = Readonly<{ latitude: number; longitude: number }>;

export type GeoBoundsRecord = Readonly<{
  southWest: GeoPointRecord;
  northEast: GeoPointRecord;
}>;

/** `ResolvedCriteria` without `effective`; `null` is no condition. */
export type CriteriaRecord = Readonly<{
  areaCodes: readonly string[] | null;
  categoryIds: readonly string[] | null;
}>;

/** A `PlaceCell` whose places are stored entries. */
export type PlaceCellRecord =
  | Readonly<{
      kind: "single";
      column: number;
      row: number;
      place: PlaceEntryRecord;
    }>
  | Readonly<{
      kind: "cluster";
      column: number;
      row: number;
      count: number;
      affiliatedCount: number;
      extent: GeoBoundsRecord;
    }>
  | Readonly<{
      kind: "colocated";
      column: number;
      row: number;
      location: GeoPointRecord;
      places: readonly PlaceEntryRecord[];
    }>;

export type MapScopeRecord =
  | Readonly<{ kind: "places"; areaCodes: readonly string[] | null }>
  | Readonly<{ kind: "region"; regionId: string }>;

type Paged = Readonly<{ page: number; limit: number }>;
type PageRecord<T> = Readonly<{ items: readonly T[]; count: number }>;

/**
 * Discovery's map, map-list, region-list and occasion-list reads
 * (`ExplorationQueries`, `store/discoveryExploration.ts`). Days are
 * `YYYY-MM-DD`.
 */
export type DiscoveryExplorationQueries = {
  /** Cells by row, then column (`MapClustering.cells`). */
  "discovery.findPlaceCells": QuerySpec<
    {
      bounds: GeoBoundsRecord;
      grid: Readonly<{ columns: number; rows: number }>;
      criteria: CriteriaRecord;
      selectedRegionId: string | null;
      today: string;
    },
    readonly PlaceCellRecord[]
  >;
  "discovery.findMapExtent": QuerySpec<
    { scope: MapScopeRecord },
    GeoBoundsRecord | null
  >;
  "discovery.findPlacesInBounds": QuerySpec<
    Paged & {
      bounds: GeoBoundsRecord;
      criteria: CriteriaRecord;
      origin: GeoPointRecord | null;
      today: string;
    },
    PageRecord<PlaceEntryRecord>
  >;
  "discovery.findRegions": QuerySpec<
    Paged & {
      bounds: GeoBoundsRecord | null;
      areaCodes: readonly string[] | null;
      vicinity: Readonly<{
        center: GeoPointRecord;
        radiusMeters: number;
      }> | null;
      origin: GeoPointRecord | null;
    },
    PageRecord<RegionRecord>
  >;
  "discovery.findOccasions": QuerySpec<
    Paged & { today: string },
    PageRecord<OccasionRecord>
  >;
};
