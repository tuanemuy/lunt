import { describe, expect, it } from "vitest";
import {
  mapCellsSchema,
  mapExtentSchema,
  mapRangeSchema,
  mapTargetsSchema,
  participantCellsSchema,
} from "../map";
import { gridOfSize, MAP_GRID_MAX } from "../mapView";

const range = (
  south: number,
  west: number,
  north: number,
  east: number,
): unknown => ({
  southWest: { latitude: south, longitude: west },
  northEast: { latitude: north, longitude: east },
});

const corners = (value: unknown) => {
  const parsed = mapRangeSchema.parse(value);
  return [
    parsed.southWest.latitude,
    parsed.southWest.longitude,
    parsed.northEast.latitude,
    parsed.northEast.longitude,
  ];
};

const criteria = { areas: [], categoryIds: [] };

describe("mapRangeSchema", () => {
  it("keeps a range that is already valid", () => {
    expect(corners(range(35.6, 139.7, 35.7, 139.8))).toEqual([
      35.6, 139.7, 35.7, 139.8,
    ]);
  });

  it("clamps latitudes beyond the poles and puts them in order", () => {
    expect(corners(range(95, 139, -120, 140))).toEqual([-90, 139, 90, 140]);
  });

  it("wraps longitudes outside [-180, 180] into it", () => {
    expect(corners(range(10, 190, 20, 200))).toEqual([10, -170, 20, -160]);
  });

  it("takes every longitude for a pan across the date line", () => {
    expect(corners(range(10, 170, 20, 190))).toEqual([10, -180, 20, 180]);
  });

  it("takes every longitude for a range wider than the world", () => {
    expect(corners(range(-80, -400, 80, 400))).toEqual([-80, -180, 80, 180]);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("refuses a %s corner", (_, value) => {
    expect(mapRangeSchema.safeParse(range(value, 0, 1, 1)).success).toBe(false);
  });
});

describe("the map's server-function inputs", () => {
  const bounds = range(35, 139, 36, 140);

  it("caps the clustering grid at MAP_GRID_MAX per side", () => {
    const grid = (columns: number, rows: number) =>
      mapCellsSchema.safeParse({
        bounds,
        grid: { columns, rows },
        criteria,
        selectedRegionId: null,
      }).success;
    expect(grid(MAP_GRID_MAX, MAP_GRID_MAX)).toBe(true);
    expect(grid(MAP_GRID_MAX + 1, 1)).toBe(false);
    expect(grid(1, MAP_GRID_MAX + 1)).toBe(false);
    expect(grid(0, 1)).toBe(false);
    expect(grid(1.5, 1)).toBe(false);
    expect(
      participantCellsSchema.safeParse({
        occasionId: "x",
        bounds,
        grid: { columns: MAP_GRID_MAX + 1, rows: 1 },
      }).success,
    ).toBe(false);
  });

  it("caps the list's page and takes only the known kinds", () => {
    const list = (page: number, kinds: string) =>
      mapTargetsSchema.safeParse({
        bounds,
        criteria,
        origin: null,
        kinds,
        page,
      }).success;
    expect(list(1, "all")).toBe(true);
    expect(list(0, "places")).toBe(false);
    expect(list(10_001, "regions")).toBe(false);
    expect(list(1, "listings")).toBe(false);
  });

  it("refuses a position outside the coordinate range", () => {
    const at = (latitude: number, longitude: number) =>
      mapExtentSchema.safeParse({ origin: { latitude, longitude } }).success;
    expect(at(35.68, 139.76)).toBe(true);
    expect(at(91, 139)).toBe(false);
    expect(at(35, -181)).toBe(false);
    expect(at(Number.NaN, 139)).toBe(false);
  });
});

describe("gridOfSize", () => {
  it("asks for one cell per 72 CSS pixels, at least one", () => {
    expect(gridOfSize({ width: 348, height: 400 })).toEqual({
      columns: 5,
      rows: 6,
    });
    expect(gridOfSize({ width: 10, height: 0 })).toEqual({
      columns: 1,
      rows: 1,
    });
  });

  it("never asks for more than the transport takes", () => {
    expect(gridOfSize({ width: 100_000, height: 100_000 })).toEqual({
      columns: MAP_GRID_MAX,
      rows: MAP_GRID_MAX,
    });
  });
});
