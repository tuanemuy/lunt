import { type GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import type { RegionId } from "@repo/core/domain/common/ids";
import type { PlaceEntry } from "./entry";
import { Geo, type MapGrid } from "./geo";

/**
 * One map cell and its places (`T`): a single place, a cluster of places at
 * different spots, or places that all share one spot.
 */
export type MapCell<T> =
  | Readonly<{ kind: "single"; column: number; row: number; place: T }>
  | Readonly<{
      kind: "cluster";
      column: number;
      row: number;
      /** Places in the cell; 2 or more. */
      count: number;
      /** How many of them belong to the selected region. */
      affiliatedCount: number;
      /** The smallest rectangle holding their spots; never a single point. */
      extent: GeoBounds;
    }>
  | Readonly<{
      kind: "colocated";
      column: number;
      row: number;
      /** The spot every place of the cell shares. */
      location: GeoPoint;
      /** 2 or more, newest first (`registeredAt` descending, then id). */
      places: readonly T[];
    }>;

/** A map cell of place entries (`spec/domains/discovery.md` 「Entry」). */
export type PlaceCell = MapCell<PlaceEntry>;

/**
 * What grouping reads of a place: its id, spot, registration time, and
 * whether it belongs to the selected region.
 */
export type MapSpot = Readonly<{
  id: string;
  location: GeoPoint;
  registeredAt: Date;
  affiliated: boolean;
}>;

const byCodePoint = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/** 「新しい順」 of places: `registeredAt` descending, then id ascending. */
const compareNewestPlaces = (a: PlaceEntry, b: PlaceEntry): number =>
  b.place.registeredAt.getTime() - a.place.registeredAt.getTime() ||
  byCodePoint(a.place.id, b.place.id);

const compareNewestSpots = (a: MapSpot, b: MapSpot): number =>
  b.registeredAt.getTime() - a.registeredAt.getTime() ||
  byCodePoint(a.id, b.id);

/**
 * `cells` over any representation of places: a store may group light rows
 * and load entries only for the cells that show them.
 */
function group<T>(
  bounds: GeoBounds,
  grid: MapGrid,
  places: readonly T[],
  spotOf: (place: T) => MapSpot,
): readonly MapCell<T>[] {
  const grouped = new Map<number, [T, ...T[]]>();
  for (const place of places) {
    const { location } = spotOf(place);
    if (!Geo.contains(bounds, location)) continue;
    const { column, row } = Geo.cellOf(bounds, grid, location);
    const key = row * grid.columns + column;
    const members = grouped.get(key);
    if (members === undefined) grouped.set(key, [place]);
    else members.push(place);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, members]): MapCell<T> => {
      const column = key % grid.columns;
      const row = Math.floor(key / grid.columns);
      const [first, ...rest] = members;
      if (rest.length === 0) {
        return { kind: "single", column, row, place: first };
      }
      const location = spotOf(first).location;
      if (
        rest.every((place) => GeoPoint.equals(spotOf(place).location, location))
      ) {
        return {
          kind: "colocated",
          column,
          row,
          location,
          places: [...members].sort((a, b) =>
            compareNewestSpots(spotOf(a), spotOf(b)),
          ),
        };
      }
      return {
        kind: "cluster",
        column,
        row,
        count: members.length,
        affiliatedCount: members.filter((place) => spotOf(place).affiliated)
          .length,
        extent: Geo.extentOfSome([
          location,
          ...rest.map((place) => spotOf(place).location),
        ]),
      };
    });
}

function cells(
  bounds: GeoBounds,
  grid: MapGrid,
  places: readonly PlaceEntry[],
  selectedRegionId: RegionId | null,
): readonly PlaceCell[] {
  return group(bounds, grid, places, (entry) => ({
    id: entry.place.id,
    location: entry.place.profile.location,
    registeredAt: entry.place.registeredAt,
    affiliated:
      selectedRegionId !== null &&
      entry.regions.some((region) => region.id === selectedRegionId),
  }));
}

/**
 * How map cells group places (`spec/domains/discovery.md`
 * 「MapClustering」), shared by the map and the participants' map. Places
 * outside `bounds` are left out and empty cells are not returned; cells
 * come by `row`, then `column`. Re-reading a cluster's `extent` as the
 * next bounds splits its places; places at one spot never split, so a
 * `colocated` cell lists them instead.
 */
export const MapClustering = { cells, group, compareNewestPlaces };
