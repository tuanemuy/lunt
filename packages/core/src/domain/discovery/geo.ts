import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import { BusinessRuleError } from "@repo/core/domain/error";
import { DiscoveryErrorCode } from "./errorCode";

declare const mapGridBrand: unique symbol;

/** How a map range is divided into cells: positive integer columns and rows. */
export type MapGrid = Readonly<{ columns: number; rows: number }> & {
  readonly [mapGridBrand]: true;
};

const isPositiveInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 1;

export const MapGrid = {
  /**
   * `DISCOVERY_INVALID_MAP_GRID` unless both are positive integers. Their
   * upper bound is the transport boundary's.
   */
  create: (columns: number, rows: number): MapGrid => {
    if (!isPositiveInteger(columns) || !isPositiveInteger(rows)) {
      throw new BusinessRuleError(
        DiscoveryErrorCode.InvalidMapGrid,
        `Map grid must have positive integer columns and rows: ${columns} × ${rows}`,
      );
    }
    return { columns, rows } as MapGrid;
  },
};

export type MapCellPosition = Readonly<{ column: number; row: number }>;

const EARTH_RADIUS_METERS = 6_371_000;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance on a 6,371,000 m sphere, rounded to the metre. */
function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const phi1 = radians(a.latitude);
  const phi2 = radians(b.latitude);
  const dPhi = radians(b.latitude - a.latitude);
  const dLambda = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return Math.round(
    2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, h))),
  );
}

/**
 * `column = min(columns − 1, floor((lng − west) / (east − west) × columns))`,
 * likewise `row` from the south. A zero-width (or zero-height) range puts
 * every point in column (row) 0.
 */
function cellOf(
  bounds: GeoBounds,
  grid: MapGrid,
  point: GeoPoint,
): MapCellPosition {
  const index = (value: number, low: number, high: number, count: number) =>
    high === low
      ? 0
      : Math.max(
          0,
          Math.min(
            count - 1,
            Math.floor(((value - low) / (high - low)) * count),
          ),
        );
  return {
    column: index(
      point.longitude,
      bounds.southWest.longitude,
      bounds.northEast.longitude,
      grid.columns,
    ),
    row: index(
      point.latitude,
      bounds.southWest.latitude,
      bounds.northEast.latitude,
      grid.rows,
    ),
  };
}

/** The smallest rectangle holding every point of a non-empty list. */
function extentOfSome(points: readonly [GeoPoint, ...GeoPoint[]]): GeoBounds {
  const [first, ...rest] = points;
  let south = first.latitude;
  let north = first.latitude;
  let west = first.longitude;
  let east = first.longitude;
  for (const point of rest) {
    south = Math.min(south, point.latitude);
    north = Math.max(north, point.latitude);
    west = Math.min(west, point.longitude);
    east = Math.max(east, point.longitude);
  }
  return GeoBounds.create(
    GeoPoint.create(south, west),
    GeoPoint.create(north, east),
  );
}

/** The smallest rectangle holding every point; `null` for none. */
function extentOf(points: readonly GeoPoint[]): GeoBounds | null {
  const [first, ...rest] = points;
  return first === undefined ? null : extentOfSome([first, ...rest]);
}

/** `distanceMeters(vicinity.center, point) <= vicinity.radiusMeters`. */
const within = (
  vicinity: Readonly<{ center: GeoPoint; radiusMeters: number }>,
  point: GeoPoint,
): boolean => distanceMeters(vicinity.center, point) <= vicinity.radiusMeters;

const degrees = (value: number): number => (value * 180) / Math.PI;

/**
 * The rectangle around a vicinity's circle: `d = radius / R`; south and
 * north are the centre's latitude ∓ d, west and east its longitude ∓
 * `asin(sin d / cos φ)` — clamped to the valid coordinate range.
 */
function boundsOf(
  vicinity: Readonly<{ center: GeoPoint; radiusMeters: number }>,
): GeoBounds {
  const { latitude, longitude } = vicinity.center;
  const d = vicinity.radiusMeters / EARTH_RADIUS_METERS;
  const dLat = degrees(d);
  const ratio = Math.sin(d) / Math.cos(radians(latitude));
  const dLng =
    ratio >= 1 || !Number.isFinite(ratio) ? 180 : degrees(Math.asin(ratio));
  const clamp = (value: number, limit: number) =>
    Math.max(-limit, Math.min(limit, value));
  return GeoBounds.create(
    GeoPoint.create(clamp(latitude - dLat, 90), clamp(longitude - dLng, 180)),
    GeoPoint.create(clamp(latitude + dLat, 90), clamp(longitude + dLng, 180)),
  );
}

/** A range holding all of Japan: south-west 20, 122; north-east 46, 154. */
const JAPAN: GeoBounds = GeoBounds.create(
  GeoPoint.create(20, 122),
  GeoPoint.create(46, 154),
);

/**
 * Distances and range tests between `GeoPoint`s and `GeoBounds`
 * (`spec/domains/discovery.md` 「Geo」). Every store follows these
 * definitions.
 */
export const Geo = {
  distanceMeters,
  /** Both coordinates inside the rectangle, edges included. */
  contains: GeoBounds.contains,
  within,
  cellOf,
  extentOf,
  extentOfSome,
  boundsOf,
  JAPAN,
};
