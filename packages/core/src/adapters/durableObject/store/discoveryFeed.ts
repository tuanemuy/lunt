import { GeoPoint } from "@repo/core/domain/common/geo";
import { RegionId } from "@repo/core/domain/common/ids";
import { Geo } from "@repo/core/domain/discovery/geo";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import type { ListingEntryRecord } from "../protocol/discovery";
import type {
  DiscoveryFeedQueries,
  FeedCandidateRecord,
  FeedCriteriaRecord,
  FeedQueryRecord,
} from "../protocol/discoveryFeed";
import type { OccasionRecord } from "../protocol/occasion";
import type { PlaceAffiliationsRecord, RegionRecord } from "../protocol/region";
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
type Origin = NonNullable<FeedCriteriaRecord["origin"]>;

/** A `WHERE` fragment and the values it binds, in order. */
type Condition = Readonly<{ sql: string; bindings: readonly unknown[] }>;

/** The ranks `[offset, end)` of an order a read returns. */
type Window = Readonly<{ offset: number; end: number }>;

const windowOf = (query: FeedQueryRecord): Window => ({
  offset: offsetOf(query.page, query.limit),
  end: query.page * query.limit,
});

/**
 * `BrowseCriteria.matchesListing` over `listings l JOIN places p`: the
 * place's area and the listing's stored category, each only when given.
 * An id list is one JSON parameter.
 */
function listingCriteria(query: FeedCriteriaRecord): Condition {
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
function feedListings(query: FeedCriteriaRecord): Condition {
  const criteria = listingCriteria(query);
  return {
    sql: `${LISTING_VIEWABLE} AND ${LISTING_DISCOVERABLE} ${criteria.sql}`,
    bindings: [query.today, query.today, ...criteria.bindings],
  };
}

/**
 * The `FROM … WHERE` of the feed listings: `lookup` for reads the planner
 * may drive by an index (a page, rows of given places), `scan` for reads
 * of the whole set. Without criteria the whole set is scanned in table
 * order: walking the newest-first index (migration 13) for every row is
 * slower than a plain scan. With criteria the planner picks its own path.
 */
function feedListingSources(query: FeedCriteriaRecord) {
  const where = feedListings(query);
  const from = (listings: string) => `FROM ${listings}
    JOIN places p ON p.id = l.place_id WHERE ${where.sql}`;
  return {
    lookup: from("listings l"),
    scan:
      query.areaCodes === null && query.categoryIds === null
        ? from("listings l NOT INDEXED")
        : from("listings l"),
    bindings: where.bindings,
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

/** `Geo.distanceMeters` from the origin, which SQL cannot express. */
function distanceFrom(origin: Origin) {
  const from = GeoPoint.create(origin.latitude, origin.longitude);
  return (latitude: number, longitude: number): number =>
    Geo.distanceMeters(from, GeoPoint.create(latitude, longitude));
}

/**
 * The window of 「近い順」 (distance, then newest first, then id) over every
 * match. Only matches no farther than the window's last rank can be in it,
 * so the rest are dropped before the full comparison sort.
 */
function nearestWindow<T extends Ranked>(
  ranked: readonly T[],
  window: Window,
): readonly T[] {
  const threshold =
    ranked.length > window.end
      ? (Float64Array.from(ranked, (r) => r.distance).sort()[window.end - 1] ??
        Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;
  return ranked
    .filter((r) => r.distance <= threshold)
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        b.newest - a.newest ||
        byCodePoint(a.id, b.id),
    )
    .slice(window.offset, window.end);
}

/** Rows of `SELECT <id>, <newest>, <latitude>, <longitude>`, ranked by their own point. */
function rankedByPoint(
  sql: SqlExec,
  select: string,
  bindings: readonly unknown[],
  origin: Origin,
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

/** A page of ids in the read's order, and the total of matches. */
type IdPage = Readonly<{ ids: readonly string[]; count: number }>;

/** A page cut in SQL by `order`, and the total counted over `countFrom`. */
function sqlPage(
  sql: SqlExec,
  id: string,
  from: string,
  order: string,
  bindings: readonly unknown[],
  window: Window,
  countFrom: string = from,
): IdPage {
  const ids = sql
    .exec<IdRow>(
      `SELECT ${id} AS id ${from} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...bindings,
      window.end - window.offset,
      window.offset,
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

type ListingOfPlaceRow = Readonly<{
  id: string;
  newest: number;
  place_id: string;
}> &
  SqlRow;

type RankedListing = Ranked & Readonly<{ placeId: string }>;

/**
 * The window of feed listings nearest first, with their places. A
 * listing's distance is its place's, so the places are ranked first (one
 * row per place with its count of matches): only listings of the places up
 * to the one holding the window's last rank are read and fully compared.
 * The total is the tallies' sum.
 */
function nearestListings(
  sql: SqlExec,
  query: FeedCriteriaRecord,
  origin: Origin,
  window: Window,
): Readonly<{ listings: readonly RankedListing[]; count: number }> {
  const sources = feedListingSources(query);
  const distance = distanceFrom(origin);
  const places = sql
    .exec<PlaceTallyRow>(
      `SELECT p.id, COUNT(*) AS n, p.latitude, p.longitude ${sources.scan}
         GROUP BY p.id`,
      ...sources.bindings,
    )
    .toArray()
    .map((row) => ({
      id: row.id,
      n: Number(row.n),
      distance: distance(Number(row.latitude), Number(row.longitude)),
    }))
    .sort((a, b) => a.distance - b.distance);
  const count = places.reduce((sum, place) => sum + place.n, 0);
  let covered = 0;
  let threshold = Number.POSITIVE_INFINITY;
  for (const place of places) {
    covered += place.n;
    if (covered >= window.end) {
      threshold = place.distance;
      break;
    }
  }
  const near = places.filter((place) => place.distance <= threshold);
  if (near.length === 0) return { listings: [], count };
  const distanceOf = new Map(near.map((place) => [place.id, place.distance]));
  const ranked = sql
    .exec<ListingOfPlaceRow>(
      `SELECT l.id, l.first_published_at AS newest, l.place_id
         ${sources.lookup}
         AND l.place_id IN (SELECT value FROM json_each(?))`,
      ...sources.bindings,
      idsParam(near.map((place) => place.id)),
    )
    .toArray()
    .map((row) => ({
      id: row.id,
      newest: Number(row.newest),
      placeId: row.place_id,
      distance: distanceOf.get(row.place_id) ?? Number.POSITIVE_INFINITY,
    }));
  return { listings: nearestWindow(ranked, window), count };
}

function nearestListingIds(
  sql: SqlExec,
  query: FeedCriteriaRecord,
  origin: Origin,
  window: Window,
): IdPage {
  const { listings, count } = nearestListings(sql, query, origin, window);
  return { ids: listings.map((listing) => listing.id), count };
}

function findListings(
  sql: SqlExec,
  query: FeedQueryRecord,
): Page<ListingEntryRecord> {
  const sources = feedListingSources(query);
  const window = windowOf(query);
  const { ids, count } =
    query.origin === null
      ? sqlPage(
          sql,
          "l.id",
          sources.lookup,
          "l.first_published_at DESC, l.id",
          sources.bindings,
          window,
          sources.scan,
        )
      : nearestListingIds(sql, query, query.origin, window);
  return { items: inOrder(ids, viewableListings(sql, ids)), count };
}

type AffiliationsRow = Readonly<{
  place_id: string;
  affiliations: string;
  chosen_representative: string | null;
  updated_at: number;
  version: number;
}> &
  SqlRow;

type AffiliatedRegionRow = Readonly<{
  place_id: string;
  region_id: string;
}> &
  SqlRow;

/**
 * Each place's displayed region (`PlaceAffiliations.displayedRegion` over
 * its viewable affiliated regions) — the first of the place entry's
 * regions (`ViewProjection.regionsOf`). Places without stored
 * affiliations or a viewable affiliated region have none.
 */
function displayedRegions(
  sql: SqlExec,
  placeIds: readonly string[],
): ReadonlyMap<string, RegionId> {
  if (placeIds.length === 0) return new Map();
  const ids = idsParam([...new Set(placeIds)]);
  const viewable = new Map<string, Set<RegionId>>();
  for (const row of sql
    .exec<AffiliatedRegionRow>(
      `SELECT ra.place_id, ra.region_id
         FROM region_affiliations ra JOIN regions r ON r.id = ra.region_id
         WHERE ra.place_id IN (SELECT value FROM json_each(?))
           AND ${REGION_VIEWABLE}`,
      ids,
    )
    .toArray()) {
    const regions = viewable.get(row.place_id) ?? new Set<RegionId>();
    regions.add(RegionId.create(row.region_id));
    viewable.set(row.place_id, regions);
  }
  const displayed = new Map<string, RegionId>();
  for (const row of sql
    .exec<AffiliationsRow>(
      `SELECT place_id, affiliations, chosen_representative, updated_at,
              version
         FROM place_affiliations
         WHERE place_id IN (SELECT value FROM json_each(?))`,
      ids,
    )
    .toArray()) {
    const regions = viewable.get(row.place_id);
    if (regions === undefined) continue;
    const stored = JSON.parse(
      row.affiliations,
    ) as PlaceAffiliationsRecord["affiliations"];
    const region = PlaceAffiliations.displayedRegion(
      PlaceAffiliations.reconstruct({
        placeId: row.place_id,
        affiliations: stored.map((affiliation) => ({
          regionId: affiliation.regionId,
          affiliatedAt: new Date(Number(affiliation.affiliatedAt)),
        })),
        chosenRepresentative: row.chosen_representative,
        updatedAt: new Date(Number(row.updated_at)),
        version: Number(row.version),
      }),
      regions,
    );
    if (region !== null) displayed.set(row.place_id, region);
  }
  return displayed;
}

type CandidateRow = Readonly<{ id: string; place_id: string }> & SqlRow;

/**
 * The first `upTo` feed listings in the priority order (newest first, or
 * nearest first with an origin), light: ids and the displayed region. The
 * total is counted once.
 */
function findListingCandidates(
  sql: SqlExec,
  query: FeedCriteriaRecord & Readonly<{ upTo: number }>,
): Readonly<{ candidates: readonly FeedCandidateRecord[]; count: number }> {
  const window: Window = { offset: 0, end: query.upTo };
  const sources = feedListingSources(query);
  const { listings, count } =
    query.origin === null
      ? {
          listings: sql
            .exec<CandidateRow>(
              `SELECT l.id, l.place_id ${sources.lookup}
                 ORDER BY l.first_published_at DESC, l.id LIMIT ?`,
              ...sources.bindings,
              query.upTo,
            )
            .toArray()
            .map((row) => ({ id: row.id, placeId: row.place_id })),
          count: countOf(sql, sources.scan, ...sources.bindings),
        }
      : nearestListings(sql, query, query.origin, window);
  const regions = displayedRegions(
    sql,
    listings.map((listing) => listing.placeId),
  );
  return {
    candidates: listings.map((listing) => ({
      listingId: listing.id,
      placeId: listing.placeId,
      regionId: regions.get(listing.placeId) ?? null,
    })),
    count,
  };
}

/**
 * Regions with a feed listing at any affiliated place. Binds the feed
 * listings' values.
 */
function regionFrames(query: FeedCriteriaRecord): Condition {
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
  origin: Origin,
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

/** The ids of a nearest-first window, and the total of `ranked`. */
const nearestIdPage = (ranked: readonly Ranked[], window: Window): IdPage => ({
  ids: nearestWindow(ranked, window).map((r) => r.id),
  count: ranked.length,
});

function findRegionFrames(
  sql: SqlExec,
  query: FeedQueryRecord,
): Page<RegionRecord> {
  const where = regionFrames(query);
  const from = `FROM regions r WHERE ${where.sql}`;
  const window = windowOf(query);
  const { ids, count } =
    query.origin === null
      ? sqlPage(
          sql,
          "r.id",
          from,
          "r.first_published_at DESC, r.id",
          where.bindings,
          window,
        )
      : nearestIdPage(
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
          window,
        );
  return { items: inOrder(ids, regionRecords(sql, ids)), count };
}

/**
 * Viewable upcoming or ongoing occasions with a viewable participating
 * place, their venue in the chosen areas. Binds the day, then the areas.
 */
function occasionFrames(query: FeedCriteriaRecord): Condition {
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
  const window = windowOf(query);
  const { ids, count } =
    query.origin === null
      ? sqlPage(sql, "o.id", from, OCCASION_ORDER, where.bindings, window)
      : nearestIdPage(
          rankedByPoint(
            sql,
            `SELECT o.id, o.first_published_at AS newest,
                    o.latitude, o.longitude ${from}`,
            where.bindings,
            query.origin,
          ),
          window,
        );
  return { items: inOrder(ids, occasionRecords(sql, ids)), count };
}

/*
 * The feed's candidates (`FeedCandidateQueries`), in the discovery scene.
 * Newest-first and 「開催日の順」 pages are cut in SQL; the nearest-first
 * orders need `Geo.distanceMeters`, so the matches are ranked here and the
 * page cut after.
 */
export const discoveryFeedQueryHandlers: QueryHandlersOf<DiscoveryFeedQueries> =
  {
    "discovery.findFeedListings": (sql, query) => findListings(sql, query),
    "discovery.findFeedListingCandidates": (sql, query) =>
      findListingCandidates(sql, query),
    "discovery.findFeedRegionFrames": (sql, query) =>
      findRegionFrames(sql, query),
    "discovery.findFeedOccasionFrames": (sql, query) =>
      findOccasionFrames(sql, query),
  };
