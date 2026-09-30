import { GeoPoint } from "@repo/core/domain/common/geo";
import { Geo } from "@repo/core/domain/discovery/geo";
import type { ListingEntryRecord } from "../protocol/discovery";
import type {
  DiscoveryFeedQueries,
  FeedQueryRecord,
} from "../protocol/discoveryFeed";
import type { OccasionRecord } from "../protocol/occasion";
import type { RegionRecord } from "../protocol/region";
import type { SqlExec, SqlRow } from "../sql";
import {
  byCodePoint,
  countOf,
  idsParam,
  inOrder,
  LISTING_DISCOVERABLE,
  LISTING_VIEWABLE,
  OCCASION_OPEN,
  OCCASION_ORDER,
  OCCASION_VIEWABLE,
  offsetOf,
  PLACE_VIEWABLE,
  R_COLUMNS,
  REGION_VIEWABLE,
  viewableListings,
} from "./discovery";
import {
  OCCASION_COLUMNS,
  type OccasionRow,
  occasionRowToRecord,
} from "./occasion";
import type { QueryHandlersOf } from "./queries";
import { type RegionRow, regionRowToRecord } from "./region";

type Page<T> = Readonly<{ items: readonly T[]; count: number }>;
type IdRow = Readonly<{ id: string }> & SqlRow;

/** A `WHERE` fragment and the values it binds, in order. */
type Condition = Readonly<{ sql: string; bindings: readonly unknown[] }>;

/**
 * `BrowseCriteria.matchesListing` over `listings l JOIN places p`: the
 * place's area and the listing's stored category, each only when given.
 * An id list is one JSON parameter.
 */
function listingCriteria(query: FeedQueryRecord): Condition {
  const parts: string[] = [];
  const bindings: unknown[] = [];
  if (query.areaCodes !== null) {
    parts.push("AND p.area_code IN (SELECT value FROM json_each(?))");
    bindings.push(idsParam(query.areaCodes));
  }
  if (query.categoryIds !== null) {
    parts.push("AND l.category_id IN (SELECT value FROM json_each(?))");
    bindings.push(idsParam(query.categoryIds));
  }
  return { sql: parts.join(" "), bindings };
}

/**
 * The feed listings matching the criteria: viewable, available on the
 * day, at a place not permanently closed. Binds the day twice, then the
 * criteria.
 */
function feedListings(query: FeedQueryRecord): Condition {
  const criteria = listingCriteria(query);
  return {
    sql: `${LISTING_VIEWABLE} AND ${LISTING_DISCOVERABLE} ${criteria.sql}`,
    bindings: [query.today, query.today, ...criteria.bindings],
  };
}

type LocatedRow = Readonly<{
  id: string;
  newest: number;
  latitude: number;
  longitude: number;
}> &
  SqlRow;

type Ranked = Readonly<{ id: string; newest: number; distance: number }>;

/** A page of ids in the read's order, and the total of matches. */
type IdPage = Readonly<{ ids: readonly string[]; count: number }>;

/** `Geo.distanceMeters` from the origin, which SQL cannot express. */
function distanceFrom(origin: NonNullable<FeedQueryRecord["origin"]>) {
  const from = GeoPoint.create(origin.latitude, origin.longitude);
  return (latitude: number, longitude: number): number =>
    Geo.distanceMeters(from, GeoPoint.create(latitude, longitude));
}

/**
 * The page of 「近い順」 (distance, then newest first, then id) over every
 * match. Only matches no farther than the page's last rank can be on it,
 * so the rest are dropped before the full comparison sort.
 */
function nearestPage(
  ranked: readonly Ranked[],
  query: FeedQueryRecord,
): IdPage {
  const end = query.page * query.limit;
  const threshold =
    ranked.length > end
      ? (Float64Array.from(ranked, (r) => r.distance).sort()[end - 1] ??
        Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;
  const ids = ranked
    .filter((r) => r.distance <= threshold)
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        b.newest - a.newest ||
        byCodePoint(a.id, b.id),
    )
    .slice(offsetOf(query.page, query.limit), end)
    .map((r) => r.id);
  return { ids, count: ranked.length };
}

/** Rows of `SELECT <id>, <newest>, <latitude>, <longitude>`, ranked by their own point. */
function rankedByPoint(
  sql: SqlExec,
  select: string,
  bindings: readonly unknown[],
  origin: NonNullable<FeedQueryRecord["origin"]>,
): readonly Ranked[] {
  const distance = distanceFrom(origin);
  return sql
    .exec<LocatedRow>(select, ...bindings)
    .toArray()
    .map((row) => ({
      id: row.id,
      newest: Number(row.newest),
      distance: distance(Number(row.latitude), Number(row.longitude)),
    }));
}

/** A page cut in SQL by `order`, and the total counted over `countFrom`. */
function sqlPage(
  sql: SqlExec,
  id: string,
  from: string,
  order: string,
  bindings: readonly unknown[],
  query: FeedQueryRecord,
  countFrom: string = from,
): IdPage {
  const ids = sql
    .exec<IdRow>(
      `SELECT ${id} AS id ${from} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...bindings,
      query.limit,
      offsetOf(query.page, query.limit),
    )
    .toArray()
    .map((row) => row.id);
  return { ids, count: countOf(sql, countFrom, ...bindings) };
}

type PlaceTallyRow = Readonly<{
  id: string;
  n: number;
  latitude: number;
  longitude: number;
}> &
  SqlRow;

type NewestRow = Readonly<{ id: string; newest: number; place_id: string }> &
  SqlRow;

/**
 * The page of feed listings nearest first. A listing's distance is its
 * place's, so the places are ranked first (one row per place with its
 * count of matches): only listings of the places up to the one holding the
 * page's last rank are read and fully compared. The total is the tallies'
 * sum.
 */
function nearestListingsPage(
  sql: SqlExec,
  from: Readonly<{ scan: string; lookup: string }>,
  bindings: readonly unknown[],
  origin: NonNullable<FeedQueryRecord["origin"]>,
  query: FeedQueryRecord,
): IdPage {
  const distance = distanceFrom(origin);
  const places = sql
    .exec<PlaceTallyRow>(
      `SELECT p.id, COUNT(*) AS n, p.latitude, p.longitude ${from.scan}
         GROUP BY p.id`,
      ...bindings,
    )
    .toArray()
    .map((row) => ({
      id: row.id,
      n: Number(row.n),
      distance: distance(Number(row.latitude), Number(row.longitude)),
    }))
    .sort((a, b) => a.distance - b.distance);
  const count = places.reduce((sum, place) => sum + place.n, 0);
  const end = query.page * query.limit;
  let covered = 0;
  let threshold = Number.POSITIVE_INFINITY;
  for (const place of places) {
    covered += place.n;
    if (covered >= end) {
      threshold = place.distance;
      break;
    }
  }
  const near = places.filter((place) => place.distance <= threshold);
  if (near.length === 0) return { ids: [], count };
  const distanceOf = new Map(near.map((place) => [place.id, place.distance]));
  const ranked = sql
    .exec<NewestRow>(
      `SELECT l.id, l.first_published_at AS newest, l.place_id ${from.lookup}
         AND l.place_id IN (SELECT value FROM json_each(?))`,
      ...bindings,
      idsParam(near.map((place) => place.id)),
    )
    .toArray()
    .map((row) => ({
      id: row.id,
      newest: Number(row.newest),
      distance: distanceOf.get(row.place_id) ?? Number.POSITIVE_INFINITY,
    }));
  return { ids: nearestPage(ranked, query).ids, count };
}

function findListings(
  sql: SqlExec,
  query: FeedQueryRecord,
): Page<ListingEntryRecord> {
  const where = feedListings(query);
  const from = (listings: string) => `FROM ${listings}
    JOIN places p ON p.id = l.place_id WHERE ${where.sql}`;
  // Without criteria a whole-set read scans the table: walking the
  // newest-first index (migration 13) for every row is slower than a plain
  // scan. With criteria the planner picks its own path.
  const scan =
    query.areaCodes === null && query.categoryIds === null
      ? from("listings l NOT INDEXED")
      : from("listings l");
  const { ids, count } =
    query.origin === null
      ? sqlPage(
          sql,
          "l.id",
          from("listings l"),
          "l.first_published_at DESC, l.id",
          where.bindings,
          query,
          scan,
        )
      : nearestListingsPage(
          sql,
          { scan, lookup: from("listings l") },
          where.bindings,
          query.origin,
          query,
        );
  return { items: inOrder(ids, viewableListings(sql, ids)), count };
}

/**
 * Regions with a feed listing at any affiliated place. Binds the feed
 * listings' values.
 */
function regionFrames(query: FeedQueryRecord): Condition {
  const listings = feedListings(query);
  return {
    sql: `${REGION_VIEWABLE} AND EXISTS (SELECT 1
      FROM region_affiliations ra
        JOIN places p ON p.id = ra.place_id
        JOIN listings l ON l.place_id = p.id
      WHERE ra.region_id = r.id AND ${listings.sql})`,
    bindings: listings.bindings,
  };
}

/**
 * Regions nearest first by the nearest point of their footprint in the
 * reference scene (`RegionFootprint.of(…, "reference")`): the region's own
 * point, then every viewable affiliated place, closed ones included.
 */
function regionsByFootprint(
  sql: SqlExec,
  origin: NonNullable<FeedQueryRecord["origin"]>,
  regions: readonly Ranked[],
): readonly Ranked[] {
  if (regions.length === 0) return [];
  const distance = distanceFrom(origin);
  const nearest = new Map(regions.map((r) => [r.id, r.distance]));
  const rows = sql
    .exec<LocatedRow>(
      `SELECT ra.region_id AS id, 0 AS newest, p.latitude, p.longitude
         FROM region_affiliations ra JOIN places p ON p.id = ra.place_id
         WHERE ra.region_id IN (SELECT value FROM json_each(?))
           AND ${PLACE_VIEWABLE}`,
      idsParam(regions.map((r) => r.id)),
    )
    .toArray();
  for (const row of rows) {
    const d = distance(Number(row.latitude), Number(row.longitude));
    if (d < (nearest.get(row.id) ?? Number.POSITIVE_INFINITY)) {
      nearest.set(row.id, d);
    }
  }
  return regions.map((r) => ({
    ...r,
    distance: nearest.get(r.id) ?? r.distance,
  }));
}

function regionRecords(
  sql: SqlExec,
  ids: readonly string[],
): ReadonlyMap<string, RegionRecord> {
  if (ids.length === 0) return new Map();
  return new Map(
    sql
      .exec<RegionRow>(
        `SELECT ${R_COLUMNS} FROM regions r
           WHERE r.id IN (SELECT value FROM json_each(?)) AND ${REGION_VIEWABLE}`,
        idsParam(ids),
      )
      .toArray()
      .map((row) => [row.id, regionRowToRecord(row)]),
  );
}

function findRegionFrames(
  sql: SqlExec,
  query: FeedQueryRecord,
): Page<RegionRecord> {
  const where = regionFrames(query);
  const from = `FROM regions r WHERE ${where.sql}`;
  const { ids, count } =
    query.origin === null
      ? sqlPage(
          sql,
          "r.id",
          from,
          "r.first_published_at DESC, r.id",
          where.bindings,
          query,
        )
      : nearestPage(
          regionsByFootprint(
            sql,
            query.origin,
            rankedByPoint(
              sql,
              `SELECT r.id, r.first_published_at AS newest,
                      r.latitude, r.longitude ${from}`,
              where.bindings,
              query.origin,
            ),
          ),
          query,
        );
  return { items: inOrder(ids, regionRecords(sql, ids)), count };
}

/**
 * Viewable upcoming or ongoing occasions with a viewable participating
 * place, their venue in the chosen areas. Binds the day, then the areas.
 */
function occasionFrames(query: FeedQueryRecord): Condition {
  const inAreas =
    query.areaCodes === null
      ? ""
      : "AND o.area_code IN (SELECT value FROM json_each(?))";
  return {
    sql: `${OCCASION_VIEWABLE} AND ${OCCASION_OPEN}
      AND EXISTS (SELECT 1
        FROM occasion_participations op JOIN places p ON p.id = op.place_id
        WHERE op.occasion_id = o.id AND ${PLACE_VIEWABLE})
      ${inAreas}`,
    bindings: [
      query.today,
      ...(query.areaCodes === null ? [] : [idsParam(query.areaCodes)]),
    ],
  };
}

function occasionRecords(
  sql: SqlExec,
  ids: readonly string[],
): ReadonlyMap<string, OccasionRecord> {
  if (ids.length === 0) return new Map();
  return new Map(
    sql
      .exec<OccasionRow>(
        `SELECT ${OCCASION_COLUMNS} FROM occasions o
           WHERE o.id IN (SELECT value FROM json_each(?))
             AND ${OCCASION_VIEWABLE}`,
        idsParam(ids),
      )
      .toArray()
      .map((row) => [row.id, occasionRowToRecord(row)]),
  );
}

function findOccasionFrames(
  sql: SqlExec,
  query: FeedQueryRecord,
): Page<OccasionRecord> {
  const where = occasionFrames(query);
  const from = `FROM occasions o WHERE ${where.sql}`;
  const { ids, count } =
    query.origin === null
      ? sqlPage(sql, "o.id", from, OCCASION_ORDER, where.bindings, query)
      : nearestPage(
          rankedByPoint(
            sql,
            `SELECT o.id, o.first_published_at AS newest,
                    o.latitude, o.longitude ${from}`,
            where.bindings,
            query.origin,
          ),
          query,
        );
  return { items: inOrder(ids, occasionRecords(sql, ids)), count };
}

/*
 * The feed's candidates (`FeedCandidateQueries`), in the discovery scene.
 * Newest-first and 「開催日の順」 pages are cut in SQL; the nearest-first
 * orders need `Geo.distanceMeters`, so every match is ranked here and the
 * page cut after.
 */
export const discoveryFeedQueryHandlers: QueryHandlersOf<DiscoveryFeedQueries> =
  {
    "discovery.findFeedListings": (sql, query) => findListings(sql, query),
    "discovery.findFeedRegionFrames": (sql, query) =>
      findRegionFrames(sql, query),
    "discovery.findFeedOccasionFrames": (sql, query) =>
      findOccasionFrames(sql, query),
  };
