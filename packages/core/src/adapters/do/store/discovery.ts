import { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type {
  DiscoveryCommand,
  DiscoveryQueries,
  ListingEntryRecord,
  ParticipantEntryRecord,
  PlaceEntryRecord,
  ReferenceResolutionRecord,
  RefRecord,
  ScoredRecord,
  SubstituteCoverRecord,
} from "../protocol/discovery";
import type { ListingRecord, OfferingRecord } from "../protocol/listing";
import type { OccasionRecord } from "../protocol/occasion";
import type { PlaceAffiliationsRecord, RegionRecord } from "../protocol/region";
import type { SqlExec, SqlRow } from "../sql";
import { articleSearchText } from "./article";
import type { CommandHandlersOf } from "./commands";
import { LISTING_PHASE_SQL, listingSearchText } from "./listing";
import {
  OCCASION_COLUMNS,
  type OccasionRow,
  occasionRowToRecord,
  occasionSearchText,
  participationRowToRecord,
} from "./occasion";
import {
  PLACE_COLUMNS,
  type PlaceRow,
  placeRowToRecord,
  placeSearchText,
} from "./place";
import type { QueryHandlersOf } from "./queries";
import {
  REGION_COLUMNS,
  type RegionRow,
  regionRowToRecord,
  regionSearchText,
} from "./region";
import type { Migration } from "./schema";
import {
  candidatesSql,
  needlesParam,
  putSearchText,
  relevanceOfRow,
  SEARCH_TEXT_STATEMENTS,
  type SearchCandidates,
  type SearchTargetKind,
  type SearchTextRow,
} from "./searchText";

/**
 * Discovery keeps no state of its own: every read is computed from Place's,
 * Listing's, Region's, Occasion's, Article's and Authority's tables (their
 * store modules document the columns). Migration 13 adds only indexes for its
 * reads: `idx_listings_newest_viewable` lets the feed's newest-first
 * listing pages walk the viewable listings in order instead of sorting
 * every one.
 */
const BACKFILL_PAGE = 200;

/**
 * Visits the rows `select` (which binds the last id seen) returns, in id
 * order and `BACKFILL_PAGE` at a time, so a backfill never holds every
 * (long) row at once.
 */
function eachRow<R extends SqlRow & Readonly<{ id: string }>>(
  sql: SqlExec,
  select: string,
  visit: (row: R) => void,
): void {
  let after = "";
  for (;;) {
    const rows = sql
      .exec<R>(`${select} ORDER BY id LIMIT ?`, after, BACKFILL_PAGE)
      .toArray();
    for (const row of rows) visit(row);
    const last = rows[rows.length - 1];
    if (last === undefined || rows.length < BACKFILL_PAGE) return;
    after = last.id;
  }
}

type TextRow = Readonly<{
  id: string;
  name: string | null;
  description: string | null;
}> &
  SqlRow;

type ArticleTextRow = Readonly<{
  id: string;
  title: string | null;
  body: string | null;
}> &
  SqlRow;

/**
 * Migration 21's backfill: every stored target's search text, through the
 * same record → text functions the stores' writes use.
 */
function backfillSearchTexts(sql: SqlExec): void {
  const put = (kind: SearchTargetKind) => (id: string, text: TextOf) =>
    putSearchText(sql, kind, id, text);
  eachRow<PlaceRow>(
    sql,
    `SELECT ${PLACE_COLUMNS} FROM places WHERE id > ?`,
    (row) => put("place")(row.id, placeSearchText(placeRowToRecord(row))),
  );
  eachRow<TextRow>(
    sql,
    "SELECT id, name, description FROM listings WHERE id > ?",
    (row) =>
      put("listing")(row.id, listingSearchText(row.name, row.description)),
  );
  eachRow<RegionRow>(
    sql,
    `SELECT ${REGION_COLUMNS} FROM regions WHERE id > ?`,
    (row) => put("region")(row.id, regionSearchText(regionRowToRecord(row))),
  );
  eachRow<OccasionRow>(
    sql,
    `SELECT ${OCCASION_COLUMNS} FROM occasions o WHERE o.id > ?`,
    (row) =>
      put("occasion")(row.id, occasionSearchText(occasionRowToRecord(row))),
  );
  eachRow<ArticleTextRow>(
    sql,
    "SELECT id, title, body FROM articles WHERE id > ?",
    (row) => put("article")(row.id, articleSearchText(row)),
  );
}

type TextOf = Parameters<typeof putSearchText>[3];

/** Migration 21: the normalised keyword-search texts (`store/searchText.ts`). */
export const SEARCH_TEXT_MIGRATION: Migration = {
  version: 21,
  name: "normalised keyword-search texts",
  statements: SEARCH_TEXT_STATEMENTS,
  run: backfillSearchTexts,
};

export const DISCOVERY_MIGRATIONS: readonly Migration[] = [
  {
    version: 13,
    name: "discovery read indexes",
    statements: [
      `CREATE INDEX idx_listings_newest_viewable
         ON listings (first_published_at DESC, id)
         WHERE publication_status = 'published' AND suspended = 0`,
    ],
  },
  SEARCH_TEXT_MIGRATION,
];

/*
 * The SQL forms of `VisibilityPolicy` over `places p`, `listings l`,
 * `regions r` and `occasions o` (`domain/discovery/visibilityPolicy.ts`).
 * They compare stored flags and calendar days only; the conformance suites
 * check them against the pure functions.
 */

/** `isPlaceViewable`: not suspended. */
const PLACE_VIEWABLE = "p.suspended = 0";

/** `admits("discovery", Standing.ofPlace(…))`: not permanently closed. */
const PLACE_DISCOVERABLE = "p.operating_status <> 'permanentlyClosed'";

/** `isListingViewable`: published, not suspended, at a viewable place. */
const LISTING_VIEWABLE = `l.publication_status = 'published'
  AND l.suspended = 0 AND p.suspended = 0`;

/**
 * `admits("discovery", Standing.ofListing(…))`: available on the day bound
 * twice, at a place not permanently closed.
 */
const LISTING_DISCOVERABLE = `(${LISTING_PHASE_SQL}) = 'available'
  AND ${PLACE_DISCOVERABLE}`;

/** 「店舗の掲載の順」: available, upcoming, ended; newest first; id. Binds the day twice. */
const LISTINGS_OF_PLACE_ORDER = `CASE (${LISTING_PHASE_SQL})
    WHEN 'available' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END,
  l.first_published_at DESC, l.id`;

/** `isRegionViewable`: published and not suspended. */
const REGION_VIEWABLE =
  "r.publication_status = 'published' AND r.suspended = 0";

/** `isOccasionViewable`: published and not suspended. */
const OCCASION_VIEWABLE =
  "o.publication_status = 'published' AND o.suspended = 0";

/**
 * `admits("discovery", Standing.ofOccasion(…))` of a published occasion
 * (which has a period): not cancelled and not over on the day bound once
 * — upcoming or ongoing.
 */
const OCCASION_OPEN = "o.cancelled = 0 AND o.period_end >= ?";

/** 「開催日の順」: period start, then end, then id. */
const OCCASION_ORDER = "o.period_start, o.period_end, o.id";

/**
 * `Stewardship.isVacant` of the place `p`: no stored stewardship, or a
 * stored vacant one.
 */
const PLACE_VACANT = `NOT EXISTS (SELECT 1 FROM stewardships s
  WHERE s.target_kind = 'place' AND s.target_id = p.id
    AND s.status <> 'vacant')`;

/** `REGION_COLUMNS` qualified by the alias `r`. */
const R_COLUMNS = REGION_COLUMNS.split(",")
  .map((column) => `r.${column.trim()}`)
  .join(", ");

type ListingRow = Readonly<{
  id: string;
  place_id: string;
  publication_status: string;
  first_published_at: number | null;
  unpublish_reason: string | null;
  suspended: number;
  manual_ended: number | null;
  name: string | null;
  description: string | null;
  category_id: string | null;
  photos: string;
  photos_taken_down: number;
  offering: string;
  updated_at: number;
  version: number;
}> &
  SqlRow;

const LISTING_COLUMNS = `l.id, l.place_id, l.publication_status,
  l.first_published_at, l.unpublish_reason, l.suspended, l.manual_ended,
  l.name, l.description, l.category_id, l.photos, l.photos_taken_down,
  l.offering, l.updated_at, l.version`;

type ListingPhotoRecord = ListingRecord["content"]["photos"][number];

const listingRowToRecord = (row: ListingRow): ListingRecord => ({
  id: row.id,
  placeId: row.place_id,
  publication: {
    status: row.publication_status,
    firstPublishedAt:
      row.first_published_at === null
        ? null
        : new Date(Number(row.first_published_at)),
    reason: row.unpublish_reason,
  },
  suspended: Number(row.suspended) === 1,
  manualEnded:
    row.manual_ended === null ? null : Number(row.manual_ended) === 1,
  content: {
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    photos: JSON.parse(row.photos) as readonly ListingPhotoRecord[],
    photosTakenDown: Number(row.photos_taken_down) === 1,
    offering: JSON.parse(row.offering) as OfferingRecord,
  },
  updatedAt: new Date(Number(row.updated_at)),
  version: Number(row.version),
});

type ParticipationRow = Parameters<typeof participationRowToRecord>[0];

const PARTICIPATION_COLUMNS = `op.occasion_id, op.place_id, op.listing_ids,
  op.dates, op.participated_at, op.updated_at, op.version`;

type AffiliationsRow = Readonly<{
  place_id: string;
  affiliations: string;
  chosen_representative: string | null;
  updated_at: number;
  version: number;
}> &
  SqlRow;

type CountRow = Readonly<{ n: number }> & SqlRow;
type PhotosRow = Readonly<{ id: string; photos: string }> & SqlRow;
type Page<T> = Readonly<{ items: readonly T[]; count: number }>;

const idsParam = (ids: readonly string[]): string => JSON.stringify(ids);

const byCodePoint = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

const offsetOf = (page: number, limit: number): number => (page - 1) * limit;

const countOf = (sql: SqlExec, from: string, ...bindings: unknown[]) =>
  Number(
    sql.exec<CountRow>(`SELECT COUNT(*) AS n ${from}`, ...bindings).toArray()[0]
      ?.n ?? 0,
  );

/** The JSON column as stored; the request side refuses a malformed one. */
function parseLoose<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

function viewablePlaceRows(
  sql: SqlExec,
  ids: readonly string[],
): readonly PlaceRow[] {
  if (ids.length === 0) return [];
  return sql
    .exec<PlaceRow>(
      `SELECT ${PLACE_COLUMNS} FROM places p
         WHERE p.id IN (SELECT value FROM json_each(?)) AND ${PLACE_VIEWABLE}`,
      idsParam(ids),
    )
    .toArray();
}

/**
 * `ViewProjection.substituteCover` for viewable places, in one query: the
 * cover of each photoless place's newest viewable listing (any offering
 * phase), keyed by place id. Places with a photo or no viewable listing
 * have no entry.
 */
function substituteCoversOf(
  sql: SqlExec,
  places: readonly PlaceRow[],
): ReadonlyMap<string, SubstituteCoverRecord> {
  const photoless = places
    .filter((place) => {
      const own: unknown = JSON.parse(place.photo_ids);
      return !(Array.isArray(own) && own.length > 0);
    })
    .map((place) => place.id);
  if (photoless.length === 0) return new Map();
  const rows = sql
    .exec<PhotosRow & Readonly<{ place_id: string }>>(
      `SELECT id, place_id, photos FROM (
         SELECT l.id, l.place_id, l.photos, ROW_NUMBER() OVER (
             PARTITION BY l.place_id
             ORDER BY l.first_published_at DESC, l.id) AS nth
           FROM listings l JOIN places p ON p.id = l.place_id
           WHERE l.place_id IN (SELECT value FROM json_each(?))
             AND ${LISTING_VIEWABLE})
       WHERE nth = 1`,
      idsParam(photoless),
    )
    .toArray();
  return new Map(
    rows.flatMap((row) => {
      const [photo] = JSON.parse(row.photos) as readonly ListingPhotoRecord[];
      return photo === undefined
        ? []
        : [[row.place_id, { listingId: row.id, photo }] as const];
    }),
  );
}

/** Stored affiliations of `placeIds`, keyed by place id. */
function affiliationsOf(
  sql: SqlExec,
  placeIds: readonly string[],
): ReadonlyMap<string, PlaceAffiliationsRecord> {
  if (placeIds.length === 0) return new Map();
  const rows = sql
    .exec<AffiliationsRow>(
      `SELECT place_id, affiliations, chosen_representative, updated_at,
              version
         FROM place_affiliations
         WHERE place_id IN (SELECT value FROM json_each(?))`,
      idsParam(placeIds),
    )
    .toArray();
  return new Map(
    rows.map((row) => [
      row.place_id,
      {
        placeId: row.place_id,
        affiliations: parseLoose<PlaceAffiliationsRecord["affiliations"]>(
          row.affiliations,
        ),
        chosenRepresentative: row.chosen_representative,
        updatedAt: Number(row.updated_at),
        version: Number(row.version),
      },
    ]),
  );
}

/** The viewable regions each of `placeIds` is affiliated with, by place id. */
function viewableRegionsOfPlaces(
  sql: SqlExec,
  placeIds: readonly string[],
): ReadonlyMap<string, readonly RegionRecord[]> {
  const byPlace = new Map<string, RegionRecord[]>();
  if (placeIds.length === 0) return byPlace;
  const rows = sql
    .exec<RegionRow & Readonly<{ affiliated_place_id: string }>>(
      `SELECT ra.place_id AS affiliated_place_id, ${R_COLUMNS}
         FROM region_affiliations ra JOIN regions r ON r.id = ra.region_id
         WHERE ra.place_id IN (SELECT value FROM json_each(?))
           AND ${REGION_VIEWABLE}
         ORDER BY ra.affiliated_at, r.id`,
      idsParam(placeIds),
    )
    .toArray();
  for (const row of rows) {
    const regions = byPlace.get(row.affiliated_place_id);
    const record = regionRowToRecord(row);
    if (regions === undefined) byPlace.set(row.affiliated_place_id, [record]);
    else regions.push(record);
  }
  return byPlace;
}

/** Entries of the viewable places among `ids`, keyed by id. */
function placeEntries(
  sql: SqlExec,
  ids: readonly string[],
): ReadonlyMap<string, PlaceEntryRecord> {
  const rows = viewablePlaceRows(sql, [...new Set(ids)]);
  const placeIds = rows.map((row) => row.id);
  const affiliations = affiliationsOf(sql, placeIds);
  const regions = viewableRegionsOfPlaces(sql, placeIds);
  const covers = substituteCoversOf(sql, rows);
  return new Map(
    rows.map((row) => [
      row.id,
      {
        place: placeRowToRecord(row),
        affiliations: affiliations.get(row.id) ?? null,
        regions: regions.get(row.id) ?? [],
        substituteCover: covers.get(row.id) ?? null,
      },
    ]),
  );
}

/** `ids` in their order, each looked up in `found`; missing ones dropped. */
const inOrder = <T>(
  ids: readonly string[],
  found: ReadonlyMap<string, T>,
): readonly T[] =>
  ids.flatMap((id) => {
    const value = found.get(id);
    return value === undefined ? [] : [value];
  });

function listingEntries(
  sql: SqlExec,
  rows: readonly ListingRow[],
): readonly ListingEntryRecord[] {
  const places = placeEntries(
    sql,
    rows.map((row) => row.place_id),
  );
  return rows.flatMap((row) => {
    const place = places.get(row.place_id);
    return place === undefined
      ? []
      : [{ listing: listingRowToRecord(row), place }];
  });
}

function viewableListingRows(
  sql: SqlExec,
  ids: readonly string[],
): readonly ListingRow[] {
  if (ids.length === 0) return [];
  return sql
    .exec<ListingRow>(
      `SELECT ${LISTING_COLUMNS} FROM listings l
         JOIN places p ON p.id = l.place_id
         WHERE l.id IN (SELECT value FROM json_each(?)) AND ${LISTING_VIEWABLE}`,
      idsParam([...new Set(ids)]),
    )
    .toArray();
}

/** The viewable listings among `ids`, keyed by id. */
function viewableListings(
  sql: SqlExec,
  ids: readonly string[],
): ReadonlyMap<string, ListingEntryRecord> {
  return new Map(
    listingEntries(sql, viewableListingRows(sql, ids)).map((entry) => [
      entry.listing.id,
      entry,
    ]),
  );
}

function viewableRegionRecords(
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

function viewableOccasionRecords(
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

const isRegionViewable = (sql: SqlExec, regionId: string): boolean =>
  viewableRegionRecords(sql, [regionId]).has(regionId);

const isOccasionViewable = (sql: SqlExec, occasionId: string): boolean =>
  viewableOccasionRecords(sql, [occasionId]).has(occasionId);

const refKey = (ref: RefRecord): string => `${ref.kind}:${ref.id}`;

function resolve(
  sql: SqlExec,
  refs: readonly RefRecord[],
): readonly ReferenceResolutionRecord[] {
  const distinct = [
    ...new Map(refs.map((ref) => [refKey(ref), ref] as const)).values(),
  ];
  const idsOf = (kind: string) =>
    distinct.filter((ref) => ref.kind === kind).map((ref) => ref.id);
  const listings = viewableListings(sql, idsOf("listing"));
  const places = placeEntries(sql, idsOf("place"));
  const regions = viewableRegionRecords(sql, idsOf("region"));
  const occasions = viewableOccasionRecords(sql, idsOf("occasion"));
  return distinct.map((ref): ReferenceResolutionRecord => {
    const { id } = ref;
    switch (ref.kind) {
      case "listing": {
        const entry = listings.get(id);
        if (entry !== undefined) {
          return { ref, viewable: true, target: { kind: "listing", entry } };
        }
        break;
      }
      case "place": {
        const entry = places.get(id);
        if (entry !== undefined) {
          return { ref, viewable: true, target: { kind: "place", entry } };
        }
        break;
      }
      case "region": {
        const region = regions.get(id);
        if (region !== undefined) {
          return { ref, viewable: true, target: { kind: "region", region } };
        }
        break;
      }
      case "occasion": {
        const occasion = occasions.get(id);
        if (occasion !== undefined) {
          return {
            ref,
            viewable: true,
            target: { kind: "occasion", occasion },
          };
        }
        break;
      }
    }
    return { ref, viewable: false };
  });
}

function isViewable(sql: SqlExec, ref: RefRecord): boolean {
  switch (ref.kind) {
    case "place":
      return viewablePlaceRows(sql, [ref.id]).length > 0;
    case "listing":
      return viewableListingRows(sql, [ref.id]).length > 0;
    case "region":
      return isRegionViewable(sql, ref.id);
    case "occasion":
      return isOccasionViewable(sql, ref.id);
    case "article":
      return (
        sql
          .exec(
            `SELECT 1 FROM articles
               WHERE id = ? AND publication_status = 'published'`,
            ref.id,
          )
          .toArray().length > 0
      );
    default:
      return false;
  }
}

function findOccasionsRelatedTo(
  sql: SqlExec,
  subject: DiscoveryQueries["discovery.findOccasionsRelatedTo"]["args"]["subject"],
  today: string,
): readonly OccasionRecord[] {
  const open = `${OCCASION_VIEWABLE} AND ${OCCASION_OPEN}`;
  const read = (from: string, ...bindings: unknown[]) =>
    sql
      .exec<OccasionRow>(
        `SELECT DISTINCT ${OCCASION_COLUMNS} ${from} AND ${open}
           ORDER BY ${OCCASION_ORDER}`,
        ...bindings,
        today,
      )
      .toArray()
      .map(occasionRowToRecord);
  switch (subject.kind) {
    case "listing":
      if (viewableListingRows(sql, [subject.id]).length === 0) return [];
      return read(
        `FROM occasions o
           JOIN occasion_participations op ON op.occasion_id = o.id
           WHERE EXISTS (SELECT 1 FROM json_each(op.listing_ids) j
                           WHERE j.value = ?)`,
        subject.id,
      );
    case "place":
      if (viewablePlaceRows(sql, [subject.id]).length === 0) return [];
      return read(
        `FROM occasions o
           JOIN occasion_participations op ON op.occasion_id = o.id
           WHERE op.place_id = ?`,
        subject.id,
      );
    case "region":
      if (!isRegionViewable(sql, subject.id)) return [];
      return read(
        `FROM occasions o
           JOIN occasion_region_links k ON k.occasion_id = o.id
           WHERE k.region_id = ? AND k.status = 'linked'`,
        subject.id,
      );
  }
}

function findParticipants(
  sql: SqlExec,
  occasionId: string,
): readonly ParticipantEntryRecord[] {
  if (!isOccasionViewable(sql, occasionId)) return [];
  const participations = sql
    .exec<ParticipationRow>(
      `SELECT ${PARTICIPATION_COLUMNS}
         FROM occasion_participations op JOIN places p ON p.id = op.place_id
         WHERE op.occasion_id = ? AND ${PLACE_VIEWABLE}
         ORDER BY op.participated_at, op.place_id`,
      occasionId,
    )
    .toArray()
    .map(participationRowToRecord);
  const places = placeEntries(
    sql,
    participations.map((participation) => participation.placeId),
  );
  const listings = new Map(
    viewableListingRows(
      sql,
      participations.flatMap((participation) => participation.listingIds),
    ).map((row) => [row.id, listingRowToRecord(row)]),
  );
  return participations.flatMap((participation) => {
    const place = places.get(participation.placeId);
    return place === undefined
      ? []
      : [
          {
            place,
            participation,
            listings: inOrder(participation.listingIds, listings),
          },
        ];
  });
}

function findRegionsOfOccasion(
  sql: SqlExec,
  occasionId: string,
): readonly RegionRecord[] {
  if (!isOccasionViewable(sql, occasionId)) return [];
  return sql
    .exec<RegionRow>(
      `SELECT ${R_COLUMNS}
         FROM occasion_region_links k JOIN regions r ON r.id = k.region_id
         WHERE k.occasion_id = ? AND k.status = 'linked' AND ${REGION_VIEWABLE}
         ORDER BY k.linked_at, r.id`,
      occasionId,
    )
    .toArray()
    .map(regionRowToRecord);
}

function findPlacesOfRegion(
  sql: SqlExec,
  regionId: string,
  page: number,
  limit: number,
): Page<PlaceEntryRecord> {
  if (!isRegionViewable(sql, regionId)) return { items: [], count: 0 };
  const from = `FROM region_affiliations ra JOIN places p ON p.id = ra.place_id
    WHERE ra.region_id = ? AND ${PLACE_VIEWABLE} AND ${PLACE_DISCOVERABLE}`;
  const ids = sql
    .exec<Readonly<{ id: string }> & SqlRow>(
      `SELECT p.id ${from}
         ORDER BY ra.affiliated_at DESC, p.id LIMIT ? OFFSET ?`,
      regionId,
      limit,
      offsetOf(page, limit),
    )
    .toArray()
    .map((row) => row.id);
  return {
    items: inOrder(ids, placeEntries(sql, ids)),
    count: countOf(sql, from, regionId),
  };
}

function findListingsOfRegion(
  sql: SqlExec,
  args: DiscoveryQueries["discovery.findListingsOfRegion"]["args"],
): Page<ListingEntryRecord> {
  const { regionId, excludingPlaceId, today, page, limit } = args;
  if (!isRegionViewable(sql, regionId)) return { items: [], count: 0 };
  const from = `FROM listings l JOIN places p ON p.id = l.place_id
    JOIN region_affiliations ra ON ra.place_id = p.id AND ra.region_id = ?
    WHERE ${LISTING_VIEWABLE} AND ${LISTING_DISCOVERABLE}
      AND (? IS NULL OR l.place_id <> ?)`;
  const bindings = [regionId, today, today, excludingPlaceId, excludingPlaceId];
  const rows = sql
    .exec<ListingRow>(
      `SELECT ${LISTING_COLUMNS} ${from}
         ORDER BY l.first_published_at DESC, l.id LIMIT ? OFFSET ?`,
      ...bindings,
      limit,
      offsetOf(page, limit),
    )
    .toArray();
  return {
    items: listingEntries(sql, rows),
    count: countOf(sql, from, ...bindings),
  };
}

type Ranked = Readonly<{ id: string; relevance: number; newest: number }>;

/**
 * Matches (relevance ≥ 1) ranked by relevance descending, then newest
 * first, then id — 「関連度の高い順」.
 */
function rank(candidates: readonly Ranked[]): readonly Ranked[] {
  return candidates
    .filter((candidate) => candidate.relevance >= 1)
    .sort(
      (a, b) =>
        b.relevance - a.relevance ||
        b.newest - a.newest ||
        byCodePoint(a.id, b.id),
    );
}

/** One page of `ranked`, each id looked up in `load(pageIds)`. */
function scoredPage<T>(
  ranked: readonly Ranked[],
  page: number,
  limit: number,
  load: (ids: readonly string[]) => ReadonlyMap<string, T>,
): Page<ScoredRecord<T>> {
  const slice = ranked.slice(offsetOf(page, limit), page * limit);
  const found = load(slice.map((candidate) => candidate.id));
  return {
    items: slice.flatMap((candidate) => {
      const entry = found.get(candidate.id);
      return entry === undefined
        ? []
        : [{ entry, relevance: candidate.relevance }];
    }),
    count: ranked.length,
  };
}

const keywordOf = (terms: readonly string[]) => SearchKeyword.fromTerms(terms);

/*
 * Keyword search reads the stored, normalised texts (`store/searchText.ts`,
 * D-25): `SEARCH_TEXT_MATCHES` narrows the viewable targets in SQL to those
 * holding every needle, and only they are scored — by
 * `KeywordRelevance.relevanceOfNormalized`, which is `relevance` of each
 * domain's `searchableText` (`SearchRelevance`) — without reading or
 * normalising the targets' texts again.
 */

type CandidateRow = SearchTextRow & Readonly<{ id: string; newest: number }>;

/**
 * `select`'s candidates (`candidatesSql`; `bindings` after the needles),
 * ranked by 「関連度の高い順」.
 */
function rankedCandidates(
  sql: SqlExec,
  keyword: SearchKeyword,
  select: SearchCandidates,
  ...bindings: unknown[]
): readonly Ranked[] {
  return rank(
    sql
      .exec<CandidateRow>(
        candidatesSql(select),
        needlesParam(keyword),
        needlesParam(keyword),
        ...bindings,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        relevance: relevanceOfRow(row, keyword),
        newest: Number(row.newest),
      })),
  );
}

/** Each kind's candidates; `place` and `occasion` take the selection scope. */
const KEYWORD_SEARCH = {
  place: (vacantOnly: boolean): SearchCandidates => ({
    from: `p.id, p.registered_at AS newest FROM search_texts t
      JOIN places p ON t.target_kind = 'place' AND p.id = t.target_id`,
    where: `${PLACE_VIEWABLE} ${vacantOnly ? `AND ${PLACE_VACANT}` : ""}`,
  }),
  listing: {
    from: `l.id, l.first_published_at AS newest FROM search_texts t
      JOIN listings l ON t.target_kind = 'listing' AND l.id = t.target_id
      JOIN places p ON p.id = l.place_id`,
    where: LISTING_VIEWABLE,
  },
  region: {
    from: `r.id, r.first_published_at AS newest FROM search_texts t
      JOIN regions r ON t.target_kind = 'region' AND r.id = t.target_id`,
    where: REGION_VIEWABLE,
  },
  /** Binds `today` when `openOnly`. */
  occasion: (openOnly: boolean): SearchCandidates => ({
    from: `o.id, o.first_published_at AS newest FROM search_texts t
      JOIN occasions o ON t.target_kind = 'occasion' AND o.id = t.target_id`,
    where: `${OCCASION_VIEWABLE} ${openOnly ? `AND ${OCCASION_OPEN}` : ""}`,
  }),
} as const;

function searchPlaces(
  sql: SqlExec,
  args: DiscoveryQueries["discovery.searchPlaces"]["args"],
): Page<ScoredRecord<PlaceEntryRecord>> {
  const keyword = keywordOf(args.terms);
  if (keyword === null) return { items: [], count: 0 };
  const ranked = rankedCandidates(
    sql,
    keyword,
    KEYWORD_SEARCH.place(args.vacantOnly),
  );
  return scoredPage(ranked, args.page, args.limit, (ids) =>
    placeEntries(sql, ids),
  );
}

function searchListings(
  sql: SqlExec,
  args: DiscoveryQueries["discovery.searchListings"]["args"],
): Page<ScoredRecord<ListingEntryRecord>> {
  const keyword = keywordOf(args.terms);
  if (keyword === null) return { items: [], count: 0 };
  const ranked = rankedCandidates(sql, keyword, KEYWORD_SEARCH.listing);
  return scoredPage(ranked, args.page, args.limit, (ids) =>
    viewableListings(sql, ids),
  );
}

function searchRegions(
  sql: SqlExec,
  args: DiscoveryQueries["discovery.searchRegions"]["args"],
): Page<ScoredRecord<RegionRecord>> {
  const keyword = keywordOf(args.terms);
  if (keyword === null) return { items: [], count: 0 };
  const ranked = rankedCandidates(sql, keyword, KEYWORD_SEARCH.region);
  return scoredPage(ranked, args.page, args.limit, (ids) =>
    viewableRegionRecords(sql, ids),
  );
}

function searchOccasions(
  sql: SqlExec,
  args: DiscoveryQueries["discovery.searchOccasions"]["args"],
): Page<ScoredRecord<OccasionRecord>> {
  const keyword = keywordOf(args.terms);
  if (keyword === null) return { items: [], count: 0 };
  const ranked = rankedCandidates(
    sql,
    keyword,
    KEYWORD_SEARCH.occasion(args.openOnly),
    ...(args.openOnly ? [args.today] : []),
  );
  return scoredPage(ranked, args.page, args.limit, (ids) =>
    viewableOccasionRecords(sql, ids),
  );
}

export const discoveryQueryHandlers: QueryHandlersOf<DiscoveryQueries> = {
  "discovery.findListing": (sql, { listingId }) =>
    viewableListings(sql, [listingId]).get(listingId) ?? null,

  "discovery.findPlace": (sql, { placeId }) =>
    placeEntries(sql, [placeId]).get(placeId) ?? null,

  "discovery.findRegion": (sql, { regionId }) =>
    viewableRegionRecords(sql, [regionId]).get(regionId) ?? null,

  "discovery.findOccasion": (sql, { occasionId }) =>
    viewableOccasionRecords(sql, [occasionId]).get(occasionId) ?? null,

  "discovery.findListingsOfPlace": (
    sql,
    { placeId, scene, today, page, limit },
  ) => {
    const place = placeEntries(sql, [placeId]).get(placeId);
    if (place === undefined) return { items: [], count: 0 };
    const admitted = scene === "discovery" ? `AND ${LISTING_DISCOVERABLE}` : "";
    const admittedBindings = scene === "discovery" ? [today, today] : [];
    const from = `FROM listings l JOIN places p ON p.id = l.place_id
      WHERE l.place_id = ? AND ${LISTING_VIEWABLE} ${admitted}`;
    const rows = sql
      .exec<ListingRow>(
        `SELECT ${LISTING_COLUMNS} ${from}
           ORDER BY ${LISTINGS_OF_PLACE_ORDER} LIMIT ? OFFSET ?`,
        placeId,
        ...admittedBindings,
        today,
        today,
        limit,
        offsetOf(page, limit),
      )
      .toArray();
    return {
      items: rows.map((row) => ({ listing: listingRowToRecord(row), place })),
      count: countOf(sql, from, placeId, ...admittedBindings),
    };
  },

  "discovery.findOccasionsRelatedTo": (sql, { subject, today }) =>
    findOccasionsRelatedTo(sql, subject, today),

  "discovery.findParticipants": (sql, { occasionId }) =>
    findParticipants(sql, occasionId),

  "discovery.findRegionsOfOccasion": (sql, { occasionId }) =>
    findRegionsOfOccasion(sql, occasionId),

  "discovery.findPlacesOfRegion": (sql, { regionId, page, limit }) =>
    findPlacesOfRegion(sql, regionId, page, limit),

  "discovery.findListingsOfRegion": (sql, args) =>
    findListingsOfRegion(sql, args),

  "discovery.searchPlaces": (sql, args) => searchPlaces(sql, args),
  "discovery.searchListings": (sql, args) => searchListings(sql, args),
  "discovery.searchRegions": (sql, args) => searchRegions(sql, args),
  "discovery.searchOccasions": (sql, args) => searchOccasions(sql, args),

  "discovery.resolve": (sql, { refs }) => resolve(sql, refs),

  "discovery.isViewable": (sql, { ref }) => isViewable(sql, ref),
};

export const discoveryCommandHandlers: CommandHandlersOf<DiscoveryCommand> = {};

export {
  byCodePoint,
  countOf,
  idsParam,
  inOrder,
  isRegionViewable,
  isViewable,
  KEYWORD_SEARCH,
  LISTING_COLUMNS,
  LISTING_DISCOVERABLE,
  LISTING_VIEWABLE,
  type ListingRow,
  listingEntries,
  OCCASION_OPEN,
  OCCASION_ORDER,
  OCCASION_VIEWABLE,
  offsetOf,
  PLACE_DISCOVERABLE,
  PLACE_VIEWABLE,
  placeEntries,
  R_COLUMNS,
  REGION_VIEWABLE,
  rank,
  rankedCandidates,
  scoredPage,
  viewableListings,
};
