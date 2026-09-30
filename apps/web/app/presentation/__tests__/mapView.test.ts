import { discoveryKit } from "@repo/core/application/discovery/__tests__/kit";
import { locateParticipants } from "@repo/core/application/discovery/locateParticipants";
import { describe, expect, it } from "vitest";
import { mapPins, NO_SELECTION } from "@/components/mapScreen/pins";
import {
  type CellFrame,
  clusterAnchor,
  MAP_CELL_PX,
  type MapCellItem,
  type MapRange,
  toParticipantsRead,
} from "../mapView";

const at = (latitude: number, longitude: number) => ({ latitude, longitude });

const range = (
  south: number,
  west: number,
  north: number,
  east: number,
): MapRange => ({ southWest: at(south, west), northEast: at(north, east) });

describe("clusterAnchor", () => {
  const frame: CellFrame = {
    bounds: range(35, 139, 36, 140),
    grid: { columns: 4, rows: 4 },
  };

  it("keeps the middle of the extent when it lies clear of the cell's edges", () => {
    const anchor = clusterAnchor(
      range(35.1, 139.1, 35.15, 139.15),
      0,
      0,
      frame,
    );
    expect(anchor.latitude).toBeCloseTo(35.125);
    expect(anchor.longitude).toBeCloseTo(139.125);
  });

  it("moves a middle near the cell's edge inwards by half a pin", () => {
    const margin = (0.25 * 22) / MAP_CELL_PX;
    const anchor = clusterAnchor(
      range(35.24, 139.49, 35.25, 139.5),
      1,
      0,
      frame,
    );
    expect(anchor.latitude).toBeCloseTo(35.25 - margin);
    expect(anchor.longitude).toBeCloseTo(139.5 - margin);
  });

  it("keeps the pins of neighbouring cells at least a pin apart", () => {
    const left = clusterAnchor(
      range(35.1, 139.24, 35.1, 139.2499),
      0,
      0,
      frame,
    );
    const right = clusterAnchor(
      range(35.1, 139.2501, 35.1, 139.26),
      1,
      0,
      frame,
    );
    const cellWidth = 0.25;
    expect(
      (right.longitude - left.longitude) / cellWidth,
    ).toBeGreaterThanOrEqual(44 / MAP_CELL_PX - 1e-9);
  });
});

/** Every participant a read shows, counted: a cluster counts its places. */
function tally(cells: readonly MapCellItem[]) {
  let count = 0;
  const ids: string[] = [];
  for (const cell of cells) {
    switch (cell.kind) {
      case "single":
        count += 1;
        ids.push(cell.place.placeId);
        break;
      case "colocated":
        count += cell.places.length;
        ids.push(...cell.places.map((place) => place.placeId));
        break;
      case "cluster":
        count += cell.count;
        break;
    }
  }
  return { count, ids };
}

/** Where the map goes for a cluster: its extent with a margin, as `fitBounds` pads it. */
const zoomRangeOf = (extent: MapRange): MapRange => {
  const dLat = Math.max(
    (extent.northEast.latitude - extent.southWest.latitude) * 0.25,
    0.001,
  );
  const dLng = Math.max(
    (extent.northEast.longitude - extent.southWest.longitude) * 0.25,
    0.001,
  );
  return range(
    extent.southWest.latitude - dLat,
    extent.southWest.longitude - dLng,
    extent.northEast.latitude + dLat,
    extent.northEast.longitude + dLng,
  );
};

type Cluster = Extract<MapCellItem, { kind: "cluster" }>;

const clustersOf = (cells: readonly MapCellItem[]): readonly Cluster[] =>
  cells.filter((cell): cell is Cluster => cell.kind === "cluster");

const center = (bounds: MapRange) => ({
  latitude: (bounds.southWest.latitude + bounds.northEast.latitude) / 2,
  longitude: (bounds.southWest.longitude + bounds.northEast.longitude) / 2,
});

describe("VW-08: every participant once after any zoom", () => {
  const grid = { columns: 5, rows: 7 };
  const TOKYO = 84;
  const OSAKA = 16;
  const TOTAL = TOKYO + OSAKA;

  async function world() {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    const join = async (latitude: number, longitude: number) => {
      const place = await k.w.place({
        profile: { location: at(latitude, longitude) },
      });
      await k.w.participate(E.id, place.id);
    };
    for (let i = 0; i < TOKYO; i++) {
      await join(35.6 + (i % 12) * 0.013, 139.6 + Math.floor(i / 12) * 0.029);
    }
    for (let i = 0; i < OSAKA; i++) {
      await join(34.62 + (i % 4) * 0.021, 135.45 + Math.floor(i / 4) * 0.017);
    }
    const read = async (bounds: MapRange | null) =>
      toParticipantsRead(
        await locateParticipants({
          container: k.container,
          input: { occasionId: E.id, grid, bounds },
        }),
        bounds,
        grid,
      );
    const opened = await read(null);
    if (opened.extent === null) throw new Error("participants expected");
    return { read, first: await read(zoomRangeOf(opened.extent)) };
  }

  function expectEveryParticipantOnce(cells: readonly MapCellItem[]) {
    const { count, ids } = tally(cells);
    expect(count).toBe(TOTAL);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = mapPins(cells, [], NO_SELECTION, null).map((pin) => pin.key);
    expect(new Set(keys).size).toBe(keys.length);
  }

  /** Zooms into the cluster `pick` chooses, as the map does, and checks each read. */
  async function zoomSequence(
    picks: readonly ((clusters: readonly Cluster[]) => Cluster | undefined)[],
  ) {
    const { read, first } = await world();
    expectEveryParticipantOnce(first.cells);
    let current = first;
    let zoomed = 0;
    for (const pick of picks) {
      const cluster = pick(clustersOf(current.cells));
      if (cluster === undefined) break;
      current = await read(zoomRangeOf(cluster.extent));
      expectEveryParticipantOnce(current.cells);
      zoomed++;
    }
    return zoomed;
  }

  const largest = (clusters: readonly Cluster[]) =>
    [...clusters].sort((a, b) => b.count - a.count)[0];
  const osaka = (clusters: readonly Cluster[]) =>
    clusters.find((cluster) => center(cluster.extent).longitude < 137);
  const tokyo = (clusters: readonly Cluster[]) =>
    clusters.find((cluster) => center(cluster.extent).longitude > 137);

  it("opens with the two cities apart, 100 in all", async () => {
    const { first } = await world();
    const clusters = clustersOf(first.cells);
    expect(
      clusters.map((cluster) => cluster.count).sort((a, b) => a - b),
    ).toEqual([OSAKA, TOKYO]);
  });

  it("Tokyo, then Osaka", async () => {
    expect(await zoomSequence([tokyo, osaka])).toBe(2);
  });

  it("Osaka, then Tokyo", async () => {
    expect(await zoomSequence([osaka, tokyo])).toBe(2);
  });

  it("Tokyo, then deeper into its largest cluster, then back to Osaka", async () => {
    expect(await zoomSequence([tokyo, largest, largest, osaka, tokyo])).toBe(5);
  });

  it("a range straddling a cluster's edge", async () => {
    const { read, first } = await world();
    const zoomedTokyo = await read(
      zoomRangeOf(tokyo(clustersOf(first.cells))?.extent ?? range(0, 0, 0, 0)),
    );
    for (const cluster of clustersOf(zoomedTokyo.cells)) {
      const { southWest, northEast } = cluster.extent;
      const middle = center(cluster.extent);
      for (const straddling of [
        range(
          southWest.latitude - 0.01,
          southWest.longitude - 0.01,
          middle.latitude,
          middle.longitude,
        ),
        range(
          middle.latitude,
          middle.longitude,
          northEast.latitude + 0.01,
          northEast.longitude + 0.01,
        ),
      ]) {
        expectEveryParticipantOnce((await read(straddling)).cells);
      }
    }
  });
});
