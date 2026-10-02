import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import { Geo, MapGrid } from "@repo/core/domain/discovery/geo";
import {
  type MapCell,
  MapClustering,
} from "@repo/core/domain/discovery/mapClustering";
import type { PlaceEntryRecord } from "../protocol/discovery";
import type {
  CriteriaRecord,
  DiscoveryExplorationQueries,
  GeoBoundsRecord,
  GeoPointRecord,
  MapScopeRecord,
  PlaceCellRecord,
} from "../protocol/discoveryExploration";
import type { OccasionRecord } from "../protocol/occasion";
import type { RegionRecord } from "../protocol/region";
import type { SqlExec, SqlRow } from "../sql";
import {
  byCodePoint,
  countOf,
  idsParam,
  inOrder,
  isRegionViewable,
  OCCASION_OPEN,
  OCCASION_ORDER,
  OCCASION_VIEWABLE,
  offsetOf,
  PLACE_DISCOVERABLE,
  PLACE_VIEWABLE,
  placeEntries,
  R_COLUMNS,
  REGION_VIEWABLE,
} from "./discovery";
import { LISTING_PHASE_SQL } from "./listing";
import {
  OCCASION_COLUMNS,
  type OccasionRow,
  occasionRowToRecord,
} from "./occasion";
import type { QueryHandlersOf } from "./queries";
import { type RegionRow, regionRowToRecord } from "./region";

/*
 * The map, map lists, region lists and occasion list
 * (`ExplorationQueries`). Places are filtered in SQL on light rows (id,
 * spot, registration, affiliation to the selected region); grouping,
 * distances and orders by distance run the domain's pure functions
 * (`MapClustering.group`, `Geo`) in the object, and full entries are
 * loaded only for the page or the cells that show them.
 */

type Page<T> = Readonly<{ items: readonly T[]; count: number }>;

/** A SQL condition and the values it binds, in order. */
type Clause = Readonly<{ sql: string; bindings: readonly unknown[] }>;

const clause = (sql: string, ...bindings: unknown[]): Clause => ({
  sql,
  bindings,
});

const joinClauses = (clauses: readonly Clause[], by: string): Clause => ({
  sql: clauses.map((c) => `(${c.sql})`).join(` ${by} `),
  bindings: clauses.flatMap((c) => c.bindings),
});

const TRUE: Clause = clause("1 = 1");

/** `Geo.contains` over the columns of alias `alias`, edges included. */
const insideBounds = (alias: string, bounds: GeoBoundsRecord): Clause =>
  clause(
    `${alias}.latitude BETWEEN ? AND ? AND ${alias}.longitude BETWEEN ? AND ?`,
    bounds.southWest.latitude,
    bounds.northEast.latitude,
    bounds.southWest.longitude,
    bounds.northEast.longitude,
  );

/** `BrowseCriteria.inAreas` of place `p`. */
const placeInAreas = (areaCodes: readonly string[] | null): Clause =>
  areaCodes === null
    ? TRUE
    : clause(
        "p.area_code IN (SELECT value FROM json_each(?))",
        idsParam(areaCodes),
      );

/**
 * Above this many places inside the bounds, the category test runs as one
 * set of place ids read through the category index; at or below it, as a
 * per-place `EXISTS` through the location and place indexes. Both select
 * the same places; the switch only keeps a whole-map read and a zoomed-in
 * read each on their cheaper plan (the planner has no statistics to choose).
 */
const CATEGORY_SET_ABOVE = 1_000;

/**
 * `BrowseCriteria.matchesPlace` of place `p` inside `bounds`: in the areas
 * and, with a category condition, one of its viewable listings `available`
 * on `today` in a chosen (stored) category.
 */
function placeMatches(
  sql: SqlExec,
  criteria: CriteriaRecord,
  bounds: GeoBoundsRecord,
  today: string,
): Clause {
  const { categoryIds } = criteria;
  if (categoryIds === null) return placeInAreas(criteria.areaCodes);
  const inside = insideBounds("p", bounds);
  const many =
    countOf(sql, `FROM places p WHERE ${inside.sql}`, ...inside.bindings) >
    CATEGORY_SET_ABOVE;
  const listingMatches = `l.category_id IN (SELECT value FROM json_each(?))
    AND l.publication_status = 'published' AND l.suspended = 0
    AND (${LISTING_PHASE_SQL}) = 'available'`;
  const inCategories = clause(
    many
      ? `p.id IN (SELECT l.place_id FROM listings l WHERE ${listingMatches})`
      : `EXISTS (SELECT 1 FROM listings l
           WHERE l.place_id = p.id AND ${listingMatches})`,
    idsParam(categoryIds),
    today,
    today,
  );
  return joinClauses([placeInAreas(criteria.areaCodes), inCategories], "AND");
}

type SpotRow = Readonly<{
  id: string;
  latitude: number;
  longitude: number;
  registered_at: number;
  affiliated: number;
}> &
  SqlRow;

type Spot = Readonly<{
  id: string;
  location: GeoPoint;
  registeredAt: Date;
  affiliated: boolean;
}>;

/**
 * The shown (viewable, not permanently closed) places `p` inside `bounds`
 * that match `criteria`, plus — when `selected` is a viewable region — its
 * affiliated ones; `affiliated` tells those apart (`null` without one).
 */
function placesInBounds(
  sql: SqlExec,
  bounds: GeoBoundsRecord,
  criteria: CriteriaRecord,
  selectedRegionId: string | null,
  today: string,
): Readonly<{ where: Clause; affiliated: Clause | null }> {
  const selected =
    selectedRegionId !== null && isRegionViewable(sql, selectedRegionId)
      ? selectedRegionId
      : null;
  const affiliated =
    selected === null
      ? null
      : clause(
          `EXISTS (SELECT 1 FROM region_affiliations sa
             WHERE sa.region_id = ? AND sa.place_id = p.id)`,
          selected,
        );
  const matches = placeMatches(sql, criteria, bounds, today);
  const where = joinClauses(
    [
      clause(`${PLACE_VIEWABLE} AND ${PLACE_DISCOVERABLE}`),
      insideBounds("p", bounds),
      affiliated === null ? matches : joinClauses([matches, affiliated], "OR"),
    ],
    "AND",
  );
  return { where, affiliated };
}

/** The spots of `placesInBounds`, for grouping or ordering by distance. */
function spotsInBounds(
  sql: SqlExec,
  bounds: GeoBoundsRecord,
  criteria: CriteriaRecord,
  selectedRegionId: string | null,
  today: string,
): readonly Spot[] {
  const { where, affiliated } = placesInBounds(
    sql,
    bounds,
    criteria,
    selectedRegionId,
    today,
  );
  const flag = affiliated ?? clause("0");
  return sql
    .exec<SpotRow>(
      `SELECT p.id, p.latitude, p.longitude, p.registered_at,
              ${flag.sql} AS affiliated
         FROM places p WHERE ${where.sql}`,
      ...flag.bindings,
      ...where.bindings,
    )
    .toArray()
    .map((row) => ({
      id: row.id,
      location: GeoPoint.create(Number(row.latitude), Number(row.longitude)),
      registeredAt: new Date(Number(row.registered_at)),
      affiliated: Number(row.affiliated) === 1,
    }));
}

const boundsFrom = (record: GeoBoundsRecord): GeoBounds =>
  GeoBounds.create(
    GeoPoint.create(record.southWest.latitude, record.southWest.longitude),
    GeoPoint.create(record.northEast.latitude, record.northEast.longitude),
  );

const pointRecord = (point: GeoPoint): GeoPointRecord => ({
  latitude: point.latitude,
  longitude: point.longitude,
});

const boundsRecord = (bounds: GeoBounds): GeoBoundsRecord => ({
  southWest: pointRecord(bounds.southWest),
  northEast: pointRecord(bounds.northEast),
});

function findPlaceCells(
  sql: SqlExec,
  args: DiscoveryExplorationQueries["discovery.findPlaceCells"]["args"],
): readonly PlaceCellRecord[] {
  const bounds = boundsFrom(args.bounds);
  const grid = MapGrid.create(args.grid.columns, args.grid.rows);
  const spots = spotsInBounds(
    sql,
    args.bounds,
    args.criteria,
    args.selectedRegionId,
    args.today,
  );
  const cells = MapClustering.group(bounds, grid, spots, (spot) => spot);
  const shown = cells.flatMap((cell) =>
    cell.kind === "single"
      ? [cell.place.id]
      : cell.kind === "colocated"
        ? cell.places.map((spot) => spot.id)
        : [],
  );
  const entries = placeEntries(sql, shown);
  const entriesOf = (spots: readonly Spot[]): readonly PlaceEntryRecord[] =>
    inOrder(
      spots.map((spot) => spot.id),
      entries,
    );
  return cells.flatMap((cell: MapCell<Spot>): readonly PlaceCellRecord[] => {
    if (cell.kind === "cluster") {
      return [{ ...cell, extent: boundsRecord(cell.extent) }];
    }
    if (cell.kind === "colocated") {
      return [
        {
          ...cell,
          location: pointRecord(cell.location),
          places: entriesOf(cell.places),
        },
      ];
    }
    const [place] = entriesOf([cell.place]);
    return place === undefined ? [] : [{ ...cell, place }];
  });
}

/** Nearest first from `origin` (`Geo.distanceMeters`), then newest, then id. */
function byDistanceThenNewest(
  origin: GeoPoint,
  spots: readonly Spot[],
): readonly Spot[] {
  return spots
    .map((spot) => ({
      spot,
      distance: Geo.distanceMeters(origin, spot.location),
    }))
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        b.spot.registeredAt.getTime() - a.spot.registeredAt.getTime() ||
        byCodePoint(a.spot.id, b.spot.id),
    )
    .map(({ spot }) => spot);
}

const originFrom = (record: GeoPointRecord | null): GeoPoint | null =>
  record === null ? null : GeoPoint.create(record.latitude, record.longitude);

function findPlacesInBounds(
  sql: SqlExec,
  args: DiscoveryExplorationQueries["discovery.findPlacesInBounds"]["args"],
): Page<PlaceEntryRecord> {
  const origin = originFrom(args.origin);
  if (origin === null) {
    const { where } = placesInBounds(
      sql,
      args.bounds,
      args.criteria,
      null,
      args.today,
    );
    const from = `FROM places p WHERE ${where.sql}`;
    const ids = sql
      .exec<Readonly<{ id: string }> & SqlRow>(
        `SELECT p.id ${from}
           ORDER BY p.registered_at DESC, p.id LIMIT ? OFFSET ?`,
        ...where.bindings,
        args.limit,
        offsetOf(args.page, args.limit),
      )
      .toArray()
      .map((row) => row.id);
    return {
      items: inOrder(ids, placeEntries(sql, ids)),
      count: countOf(sql, from, ...where.bindings),
    };
  }
  const spots = spotsInBounds(
    sql,
    args.bounds,
    args.criteria,
    null,
    args.today,
  );
  const ids = byDistanceThenNewest(origin, spots)
    .slice(offsetOf(args.page, args.limit), args.page * args.limit)
    .map((spot) => spot.id);
  return {
    items: inOrder(ids, placeEntries(sql, ids)),
    count: spots.length,
  };
}

type ExtentRow = Readonly<{
  south: number | null;
  north: number | null;
  west: number | null;
  east: number | null;
}> &
  SqlRow;

type PointRow = Readonly<{ latitude: number; longitude: number }> & SqlRow;

const pointOf = (row: PointRow): GeoPoint =>
  GeoPoint.create(Number(row.latitude), Number(row.longitude));

/** `Geo.extentOf` of the shown places in the areas. */
function placesExtent(
  sql: SqlExec,
  areaCodes: readonly string[] | null,
): GeoBoundsRecord | null {
  const where = joinClauses(
    [
      clause(`${PLACE_VIEWABLE} AND ${PLACE_DISCOVERABLE}`),
      placeInAreas(areaCodes),
    ],
    "AND",
  );
  const [row] = sql
    .exec<ExtentRow>(
      `SELECT MIN(p.latitude) AS south, MAX(p.latitude) AS north,
              MIN(p.longitude) AS west, MAX(p.longitude) AS east
         FROM places p WHERE ${where.sql}`,
      ...where.bindings,
    )
    .toArray();
  if (
    row === undefined ||
    row.south === null ||
    row.north === null ||
    row.west === null ||
    row.east === null
  ) {
    return null;
  }
  return {
    southWest: { latitude: Number(row.south), longitude: Number(row.west) },
    northEast: { latitude: Number(row.north), longitude: Number(row.east) },
  };
}

/**
 * `Geo.extentOf` of the viewable region's `RegionFootprint.of(…,
 * "discovery")`: its own point and its shown affiliated places'.
 */
function regionExtent(sql: SqlExec, regionId: string): GeoBoundsRecord | null {
  const [own] = sql
    .exec<PointRow>(
      `SELECT r.latitude, r.longitude FROM regions r
         WHERE r.id = ? AND ${REGION_VIEWABLE}`,
      regionId,
    )
    .toArray();
  if (own === undefined) return null;
  const places = sql
    .exec<PointRow>(
      `SELECT p.latitude, p.longitude
         FROM region_affiliations ra JOIN places p ON p.id = ra.place_id
         WHERE ra.region_id = ? AND ${PLACE_VIEWABLE} AND ${PLACE_DISCOVERABLE}`,
      regionId,
    )
    .toArray();
  return boundsRecord(Geo.extentOfSome([pointOf(own), ...places.map(pointOf)]));
}

const findMapExtent = (
  sql: SqlExec,
  scope: MapScopeRecord,
): GeoBoundsRecord | null =>
  scope.kind === "places"
    ? placesExtent(sql, scope.areaCodes)
    : regionExtent(sql, scope.regionId);

type FootprintRow = Readonly<{
  region_id: string;
  latitude: number;
  longitude: number;
}> &
  SqlRow;

/**
 * The locations of each region's `RegionFootprint.of(…, "reference")`:
 * its own point first, then its viewable affiliated places' (closed ones
 * included).
 */
function footprintsOf(
  sql: SqlExec,
  regions: readonly RegionRecord[],
): ReadonlyMap<string, readonly GeoPoint[]> {
  const footprints = new Map<string, GeoPoint[]>();
  for (const region of regions) {
    if (region.content.location === null) continue;
    footprints.set(region.id, [
      GeoPoint.create(
        region.content.location.latitude,
        region.content.location.longitude,
      ),
    ]);
  }
  if (footprints.size === 0) return footprints;
  const rows = sql
    .exec<FootprintRow>(
      `SELECT ra.region_id, p.latitude, p.longitude
         FROM region_affiliations ra JOIN places p ON p.id = ra.place_id
         WHERE ra.region_id IN (SELECT value FROM json_each(?))
           AND ${PLACE_VIEWABLE}`,
      idsParam([...footprints.keys()]),
    )
    .toArray();
  for (const row of rows) {
    footprints.get(row.region_id)?.push(pointOf(row));
  }
  return footprints;
}

/**
 * `BrowseCriteria.matchesRegion` over the reference footprint of region
 * `r`: its own address, or a viewable affiliated place's, is in the areas.
 */
const regionInAreas = (areaCodes: readonly string[] | null): Clause => {
  if (areaCodes === null) return TRUE;
  const codes = idsParam(areaCodes);
  return clause(
    `r.area_code IN (SELECT value FROM json_each(?))
       OR EXISTS (SELECT 1 FROM region_affiliations fa
                    JOIN places p ON p.id = fa.place_id
                    WHERE fa.region_id = r.id AND ${PLACE_VIEWABLE}
                      AND p.area_code IN (SELECT value FROM json_each(?)))`,
    codes,
    codes,
  );
};

const firstPublished = (region: RegionRecord): number =>
  region.publication.firstPublishedAt ?? 0;

function findRegions(
  sql: SqlExec,
  args: DiscoveryExplorationQueries["discovery.findRegions"]["args"],
): Page<RegionRecord> {
  const where = joinClauses(
    [
      clause(REGION_VIEWABLE),
      args.bounds === null ? TRUE : insideBounds("r", args.bounds),
      regionInAreas(args.areaCodes),
    ],
    "AND",
  );
  const candidates = sql
    .exec<RegionRow>(
      `SELECT ${R_COLUMNS} FROM regions r WHERE ${where.sql}
         ORDER BY r.first_published_at DESC, r.id`,
      ...where.bindings,
    )
    .toArray()
    .map(regionRowToRecord);
  const origin = originFrom(args.origin);
  const { vicinity } = args;
  let regions: readonly RegionRecord[] = candidates;
  if (vicinity !== null || origin !== null) {
    const footprints = footprintsOf(sql, candidates);
    const pointsOf = (region: RegionRecord) => footprints.get(region.id) ?? [];
    if (vicinity !== null) {
      const center = GeoPoint.create(
        vicinity.center.latitude,
        vicinity.center.longitude,
      );
      const circle = { center, radiusMeters: vicinity.radiusMeters };
      regions = regions.filter((region) =>
        pointsOf(region).some((point) => Geo.within(circle, point)),
      );
    }
    if (origin !== null) {
      const nearest = (region: RegionRecord) => {
        let distance = Number.POSITIVE_INFINITY;
        for (const point of pointsOf(region)) {
          distance = Math.min(distance, Geo.distanceMeters(origin, point));
        }
        return distance;
      };
      regions = regions
        .map((region) => ({ region, distance: nearest(region) }))
        .sort(
          (a, b) =>
            a.distance - b.distance ||
            firstPublished(b.region) - firstPublished(a.region) ||
            byCodePoint(a.region.id, b.region.id),
        )
        .map(({ region }) => region);
    }
  }
  return {
    items: regions.slice(
      offsetOf(args.page, args.limit),
      args.page * args.limit,
    ),
    count: regions.length,
  };
}

function findOccasions(
  sql: SqlExec,
  args: DiscoveryExplorationQueries["discovery.findOccasions"]["args"],
): Page<OccasionRecord> {
  const from = `FROM occasions o WHERE ${OCCASION_VIEWABLE} AND ${OCCASION_OPEN}`;
  const items = sql
    .exec<OccasionRow>(
      `SELECT ${OCCASION_COLUMNS} ${from}
         ORDER BY ${OCCASION_ORDER} LIMIT ? OFFSET ?`,
      args.today,
      args.limit,
      offsetOf(args.page, args.limit),
    )
    .toArray()
    .map(occasionRowToRecord);
  return { items, count: countOf(sql, from, args.today) };
}

export const discoveryExplorationQueryHandlers: QueryHandlersOf<DiscoveryExplorationQueries> =
  {
    "discovery.findPlaceCells": (sql, args) => findPlaceCells(sql, args),
    "discovery.findMapExtent": (sql, { scope }) => findMapExtent(sql, scope),
    "discovery.findPlacesInBounds": (sql, args) =>
      findPlacesInBounds(sql, args),
    "discovery.findRegions": (sql, args) => findRegions(sql, args),
    "discovery.findOccasions": (sql, args) => findOccasions(sql, args),
  };
