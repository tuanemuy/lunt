import { type GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import type { RegionId } from "@repo/core/domain/common/ids";
import type { PlaceEntry } from "./entry";
import { Geo, type MapGrid } from "./geo";

/**
 * One map cell and its places: a single place, a cluster of places at
 * different spots, or places that all share one spot.
 */
export type PlaceCell =
  | Readonly<{ kind: "single"; column: number; row: number; place: PlaceEntry }>
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
      places: readonly PlaceEntry[];
    }>;

const byCodePoint = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/** 「新しい順」 of places: `registeredAt` descending, then id ascending. */
const compareNewestPlaces = (a: PlaceEntry, b: PlaceEntry): number =>
  b.place.registeredAt.getTime() - a.place.registeredAt.getTime() ||
  byCodePoint(a.place.id, b.place.id);

function cells(
  bounds: GeoBounds,
  grid: MapGrid,
  places: readonly PlaceEntry[],
  selectedRegionId: RegionId | null,
): readonly PlaceCell[] {
  const grouped = new Map<number, [PlaceEntry, ...PlaceEntry[]]>();
  for (const entry of places) {
    const { location } = entry.place.profile;
    if (!Geo.contains(bounds, location)) continue;
    const { column, row } = Geo.cellOf(bounds, grid, location);
    const key = row * grid.columns + column;
    const group = grouped.get(key);
    if (group === undefined) grouped.set(key, [entry]);
    else group.push(entry);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, group]): PlaceCell => {
      const column = key % grid.columns;
      const row = Math.floor(key / grid.columns);
      const [first, ...rest] = group;
      if (rest.length === 0)
        return { kind: "single", column, row, place: first };
      const location = first.place.profile.location;
      if (
        rest.every((entry) =>
          GeoPoint.equals(entry.place.profile.location, location),
        )
      ) {
        return {
          kind: "colocated",
          column,
          row,
          location,
          places: [...group].sort(compareNewestPlaces),
        };
      }
      return {
        kind: "cluster",
        column,
        row,
        count: group.length,
        affiliatedCount:
          selectedRegionId === null
            ? 0
            : group.filter((entry) =>
                entry.regions.some((region) => region.id === selectedRegionId),
              ).length,
        extent: Geo.extentOfSome([
          location,
          ...rest.map((entry) => entry.place.profile.location),
        ]),
      };
    });
}

/**
 * How map cells group places (`spec/domains/discovery.md`
 * 「MapClustering」), shared by the map and the participants' map. Places
 * outside `bounds` are left out and empty cells are not returned; cells
 * come by `row`, then `column`. Re-reading a cluster's `extent` as the
 * next bounds splits its places; places at one spot never split, so a
 * `colocated` cell lists them instead.
 */
export const MapClustering = { cells, compareNewestPlaces };
