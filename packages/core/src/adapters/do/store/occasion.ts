import {
  KeywordRelevance,
  SearchKeyword,
} from "@repo/core/domain/common/searchKeyword";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type {
  HoldingStatusRecordRecord,
  OccasionCommand,
  OccasionQueries,
  OccasionRecord,
  Page,
  ParticipationRecord,
  RegionLinkRecord,
} from "../protocol/occasion";
import type { SqlExec, SqlRow, SqlValue } from "../sql";
import type { CommandHandlersOf } from "./commands";
import type { ContentLookup } from "./contentLookups";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import type { StewardedTargetLookup } from "./stewardedTargetLookups";
import {
  APPLIED,
  deleteVersioned,
  insertUnique,
  updateVersioned,
} from "./versioned";

/**
 * Occasion's tables (version 18), written only from aggregate snapshots
 * and the ledger's records. Other domains' object-side reads (Discovery,
 * the directories) may read them; `OCCASION_COLUMNS` + `occasionRowToRecord`
 * rebuild an `OccasionRecord` from an `occasions o` row.
 *
 * `occasions` — one row per occasion (never deleted):
 *
 * | column | type | meaning |
 * | --- | --- | --- |
 * | `id` | TEXT PK | `OccasionId` |
 * | `publication_status` | TEXT | `draft` / `published` / `unpublished` |
 * | `first_published_at` | INTEGER NULL | epoch ms of the first publication (`NULL` for a draft) — orders 「新しい順」 |
 * | `unpublish_reason` | TEXT NULL | `byManager` / `photoTakedown` (unpublished only) |
 * | `suspended` | INTEGER 0/1 | 運営による非公開 |
 * | `cancelled` | INTEGER 0/1 | 中止 |
 * | `name` | TEXT NULL | `OccasionName` |
 * | `period_start`, `period_end` | TEXT NULL | the holding period as `YYYY-MM-DD` (both or neither; inclusive). On day `T` a non-cancelled occasion is `upcoming` when `period_start > T`, `ongoing` when `period_start <= T <= period_end`, `ended` when `period_end < T` (`HoldingStatus.of`) |
 * | `area_code` | TEXT NULL | `Address.areaCode` — the occasion's area; `NULL` when there is no address |
 * | `prefecture`, `municipality`, `town`, `address_rest` | TEXT NULL | the rest of the address (`Address.text` joins them in this order); all `NULL` with `area_code` |
 * | `latitude`, `longitude` | REAL NULL | the venue's point (both or neither) |
 * | `photo_ids` | TEXT | JSON array of `PhotoId`s in display order (first = cover) |
 * | `photos_taken_down` | INTEGER 0/1 | `PhotoSet.takenDown` |
 * | `description`, `tagline` | TEXT NULL | `OccasionDescription`, `Tagline` |
 * | `updated_at` | INTEGER | epoch ms |
 * | `version` | INTEGER | optimistic-lock version |
 *
 * A viewer may see an occasion iff `publication_status = 'published' AND
 * suspended = 0` (`VisibilityPolicy.isOccasionViewable`); cancellation and
 * the holding status do not matter to that.
 *
 * `occasion_participations` — one row per (occasion, place) taking part:
 * `occasion_id`, `place_id` (PK together), `listing_ids` (JSON array of
 * attached `ListingId`s in attach order), `dates` (JSON array of
 * `YYYY-MM-DD`, ascending; days outside the current period stay and are
 * hidden by `ParticipationDetails.datesWithin`), `participated_at` (epoch
 * ms, orders 「参加の新しい順」), `updated_at`, `version`.
 *
 * `occasion_region_links` — one row per (occasion, region) pair:
 * `occasion_id`, `region_id` (PK together), `status` (`linked` /
 * `detached`; viewers see only `linked`), `linked_at` (epoch ms, the first
 * link; a restore keeps it), `updated_at`, `version`.
 *
 * `occasion_holding_status_records` — the `HoldingStatusLedger`, one row per
 * occasion id, not tied to the occasion row: `occasion_id` (PK),
 * `last_observed` (`upcoming` / `ongoing` / `ended` / `cancelled` / `NULL`),
 * `observed_version`, `next_change_on` (`YYYY-MM-DD` or `NULL`).
 */
const OCCASION_TABLES_MIGRATION: Migration = {
  version: 18,
  name: "occasions, participations, region links and holding status records",
  statements: [
    `CREATE TABLE occasions (
      id TEXT PRIMARY KEY,
      publication_status TEXT NOT NULL,
      first_published_at INTEGER,
      unpublish_reason TEXT,
      suspended INTEGER NOT NULL,
      cancelled INTEGER NOT NULL,
      name TEXT,
      period_start TEXT,
      period_end TEXT,
      area_code TEXT,
      prefecture TEXT,
      municipality TEXT,
      town TEXT,
      address_rest TEXT,
      latitude REAL,
      longitude REAL,
      photo_ids TEXT NOT NULL,
      photos_taken_down INTEGER NOT NULL,
      description TEXT,
      tagline TEXT,
      updated_at INTEGER NOT NULL,
      version INTEGER NOT NULL
    )`,
    `CREATE INDEX idx_occasions_published
       ON occasions (first_published_at DESC, id)
       WHERE publication_status = 'published' AND suspended = 0`,
    "CREATE INDEX idx_occasions_area_code ON occasions (area_code)",
    "CREATE INDEX idx_occasions_period ON occasions (period_end, period_start)",
    `CREATE TABLE occasion_participations (
      occasion_id TEXT NOT NULL,
      place_id TEXT NOT NULL,
      listing_ids TEXT NOT NULL,
      dates TEXT NOT NULL,
      participated_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      version INTEGER NOT NULL,
      PRIMARY KEY (occasion_id, place_id)
    )`,
    `CREATE INDEX idx_occasion_participations_occasion
       ON occasion_participations (occasion_id, participated_at DESC, place_id)`,
    `CREATE INDEX idx_occasion_participations_place
       ON occasion_participations (place_id, participated_at DESC, occasion_id)`,
    `CREATE TABLE occasion_region_links (
      occasion_id TEXT NOT NULL,
      region_id TEXT NOT NULL,
      status TEXT NOT NULL,
      linked_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      version INTEGER NOT NULL,
      PRIMARY KEY (occasion_id, region_id)
    )`,
    `CREATE INDEX idx_occasion_region_links_occasion
       ON occasion_region_links (occasion_id, linked_at, region_id)`,
    `CREATE INDEX idx_occasion_region_links_region
       ON occasion_region_links (region_id, linked_at DESC, occasion_id)`,
    `CREATE TABLE occasion_holding_status_records (
      occasion_id TEXT PRIMARY KEY,
      last_observed TEXT,
      observed_version INTEGER NOT NULL,
      next_change_on TEXT
    )`,
  ],
};

/**
 * Occasion's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Occasion has 18; take the next free number across
 * all domains for any later migration.
 */
export const OCCASION_MIGRATIONS: readonly Migration[] = [
  OCCASION_TABLES_MIGRATION,
];

export type OccasionRow = Readonly<{
  id: string;
  publication_status: string;
  first_published_at: number | null;
  unpublish_reason: string | null;
  suspended: number;
  cancelled: number;
  name: string | null;
  period_start: string | null;
  period_end: string | null;
  area_code: string | null;
  prefecture: string | null;
  municipality: string | null;
  town: string | null;
  address_rest: string | null;
  latitude: number | null;
  longitude: number | null;
  photo_ids: string;
  photos_taken_down: number;
  description: string | null;
  tagline: string | null;
  updated_at: number;
  version: number;
}> &
  SqlRow;

/** Every column of `occasions o`, for `SELECT ${OCCASION_COLUMNS} FROM occasions o`. */
export const OCCASION_COLUMNS = `o.id, o.publication_status,
  o.first_published_at, o.unpublish_reason, o.suspended, o.cancelled,
  o.name, o.period_start, o.period_end, o.area_code, o.prefecture,
  o.municipality, o.town, o.address_rest, o.latitude, o.longitude,
  o.photo_ids, o.photos_taken_down, o.description, o.tagline, o.updated_at,
  o.version`;

type CountRow = Readonly<{ n: number }> & SqlRow;

const parseStrings = (raw: string): readonly string[] =>
  JSON.parse(raw) as readonly string[];

/**
 * An `occasions` row as the at-rest record. Values pass through unchecked:
 * the request side's `Occasion.reconstruct` refuses a broken one.
 */
export function occasionRowToRecord(row: OccasionRow): OccasionRecord {
  return {
    id: row.id,
    publication: {
      status: row.publication_status,
      firstPublishedAt:
        row.first_published_at === null
          ? null
          : new Date(Number(row.first_published_at)),
      reason: row.unpublish_reason,
    },
    suspended: Number(row.suspended) === 1,
    cancelled: Number(row.cancelled) === 1,
    content: {
      name: row.name,
      period:
        row.period_start === null || row.period_end === null
          ? null
          : { start: row.period_start, end: row.period_end },
      venue: {
        address:
          row.area_code === null
            ? null
            : {
                areaCode: row.area_code,
                prefecture: row.prefecture ?? "",
                municipality: row.municipality ?? "",
                town: row.town ?? "",
                rest: row.address_rest ?? "",
              },
        location:
          row.latitude === null || row.longitude === null
            ? null
            : {
                latitude: Number(row.latitude),
                longitude: Number(row.longitude),
              },
      },
      photoIds: parseStrings(row.photo_ids),
      photosTakenDown: Number(row.photos_taken_down) === 1,
      description: row.description,
      tagline: row.tagline,
    },
    updatedAt: new Date(Number(row.updated_at)),
    version: Number(row.version),
  };
}

const flag = (value: boolean): number => (value ? 1 : 0);

const occasionValues = (
  record: OccasionRecord,
): Readonly<Record<string, SqlValue>> => {
  const { content } = record;
  const { address, location } = content.venue;
  return {
    publication_status: record.publication.status,
    first_published_at: record.publication.firstPublishedAt?.getTime() ?? null,
    unpublish_reason: record.publication.reason,
    suspended: flag(record.suspended),
    cancelled: flag(record.cancelled),
    name: content.name,
    period_start: content.period?.start ?? null,
    period_end: content.period?.end ?? null,
    area_code: address?.areaCode ?? null,
    prefecture: address?.prefecture ?? null,
    municipality: address?.municipality ?? null,
    town: address?.town ?? null,
    address_rest: address?.rest ?? null,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    photo_ids: JSON.stringify(content.photoIds),
    photos_taken_down: flag(content.photosTakenDown),
    description: content.description,
    tagline: content.tagline,
    updated_at: record.updatedAt.getTime(),
    version: record.version,
  };
};

export function findOccasionRecords(
  sql: SqlExec,
  ids: readonly string[],
): OccasionRecord[] {
  if (ids.length === 0) return [];
  return sql
    .exec<OccasionRow>(
      `SELECT ${OCCASION_COLUMNS} FROM occasions o
         WHERE o.id IN (SELECT value FROM json_each(?))`,
      JSON.stringify(ids),
    )
    .toArray()
    .map(occasionRowToRecord);
}

const byCodePoint = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * `KeywordRelevance` over `Occasion.searchableText` of every occasion,
 * computed here rather than in SQL so the result does not depend on the
 * store's collation or text functions. A row that does not rebuild
 * fails the read, as it would on the request side.
 */
function searchForOperation(
  sql: SqlExec,
  terms: readonly string[],
  page: number,
  limit: number,
): Page<OccasionRecord> {
  const keyword = SearchKeyword.fromTerms(terms);
  if (keyword === null) return { items: [], count: 0 };
  const ranked = sql
    .exec<OccasionRow>(`SELECT ${OCCASION_COLUMNS} FROM occasions o`)
    .toArray()
    .map(occasionRowToRecord)
    .map((record) => ({
      record,
      relevance: KeywordRelevance.relevance(
        Occasion.searchableText(Occasion.reconstruct(record)),
        keyword,
      ),
    }))
    .filter((entry) => entry.relevance >= 1)
    .sort(
      (a, b) =>
        b.relevance - a.relevance || byCodePoint(a.record.id, b.record.id),
    );
  return {
    items: ranked
      .slice((page - 1) * limit, page * limit)
      .map((entry) => entry.record),
    count: ranked.length,
  };
}

type ParticipationRow = Readonly<{
  occasion_id: string;
  place_id: string;
  listing_ids: string;
  dates: string;
  participated_at: number;
  updated_at: number;
  version: number;
}> &
  SqlRow;

const PARTICIPATION_COLUMNS = `p.occasion_id, p.place_id, p.listing_ids,
  p.dates, p.participated_at, p.updated_at, p.version`;

export const participationRowToRecord = (
  row: ParticipationRow,
): ParticipationRecord => ({
  occasionId: row.occasion_id,
  placeId: row.place_id,
  listingIds: parseStrings(row.listing_ids),
  dates: parseStrings(row.dates),
  participatedAt: new Date(Number(row.participated_at)),
  updatedAt: new Date(Number(row.updated_at)),
  version: Number(row.version),
});

const participationValues = (record: ParticipationRecord) => ({
  listing_ids: JSON.stringify(record.listingIds),
  dates: JSON.stringify(record.dates),
  participated_at: record.participatedAt.getTime(),
  updated_at: record.updatedAt.getTime(),
  version: record.version,
});

type RegionLinkRow = Readonly<{
  occasion_id: string;
  region_id: string;
  status: string;
  linked_at: number;
  updated_at: number;
  version: number;
}> &
  SqlRow;

const REGION_LINK_COLUMNS = `l.occasion_id, l.region_id, l.status,
  l.linked_at, l.updated_at, l.version`;

export const regionLinkRowToRecord = (
  row: RegionLinkRow,
): RegionLinkRecord => ({
  occasionId: row.occasion_id,
  regionId: row.region_id,
  status: row.status,
  linkedAt: new Date(Number(row.linked_at)),
  updatedAt: new Date(Number(row.updated_at)),
  version: Number(row.version),
});

const regionLinkValues = (record: RegionLinkRecord) => ({
  status: record.status,
  linked_at: record.linkedAt.getTime(),
  updated_at: record.updatedAt.getTime(),
  version: record.version,
});

/**
 * One page of `SELECT {columns} {from}` in `order`, and the total.
 * `columns`, `from` and `order` are this module's own SQL text.
 */
function pageOf<R extends SqlRow, T>(
  sql: SqlExec,
  columns: string,
  from: string,
  bindings: readonly unknown[],
  order: string,
  page: number,
  limit: number,
  toRecord: (row: R) => T,
): Page<T> {
  const items = sql
    .exec<R>(
      `SELECT ${columns} ${from} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...bindings,
      limit,
      (page - 1) * limit,
    )
    .toArray()
    .map(toRecord);
  const count = sql
    .exec<CountRow>(`SELECT COUNT(*) AS n ${from}`, ...bindings)
    .toArray()[0];
  return { items, count: Number(count?.n ?? 0) };
}

type HoldingRow = Readonly<{
  occasion_id: string;
  last_observed: string | null;
  observed_version: number;
  next_change_on: string | null;
}> &
  SqlRow;

const toHoldingRecord = (row: HoldingRow): HoldingStatusRecordRecord => ({
  occasionId: row.occasion_id,
  lastObserved: row.last_observed,
  observedVersion: Number(row.observed_version),
  nextChangeOn: row.next_change_on,
});

const TO_OBSERVE_FROM = `FROM occasions o
  LEFT JOIN occasion_holding_status_records r ON r.occasion_id = o.id
  WHERE r.occasion_id IS NULL
     OR r.observed_version <> o.version
     OR (r.next_change_on IS NOT NULL AND r.next_change_on <= ?)`;

type ToObserveRow = OccasionRow &
  Readonly<{
    r_occasion_id: string | null;
    r_last_observed: string | null;
    r_observed_version: number | null;
    r_next_change_on: string | null;
  }>;

function findToObserve(
  sql: SqlExec,
  today: string,
  page: number,
  limit: number,
): ReturnType<QueryHandlersOf<OccasionQueries>["occasion.findToObserve"]> {
  return pageOf<
    ToObserveRow,
    Readonly<{
      occasion: OccasionRecord;
      record: HoldingStatusRecordRecord | null;
    }>
  >(
    sql,
    `${OCCASION_COLUMNS}, r.occasion_id AS r_occasion_id,
      r.last_observed AS r_last_observed,
      r.observed_version AS r_observed_version,
      r.next_change_on AS r_next_change_on`,
    TO_OBSERVE_FROM,
    [today],
    "o.id",
    page,
    limit,
    (row) => ({
      occasion: occasionRowToRecord(row),
      record:
        row.r_occasion_id === null
          ? null
          : {
              occasionId: row.r_occasion_id,
              lastObserved: row.r_last_observed,
              observedVersion: Number(row.r_observed_version),
              nextChangeOn: row.r_next_change_on,
            },
    }),
  );
}

const describeOccasion = (id: string): string => `Occasion ${id}`;
const describeParticipation = (occasionId: string, placeId: string): string =>
  `Participation of place ${placeId} in occasion ${occasionId}`;
const describeRegionLink = (occasionId: string, regionId: string): string =>
  `Link of occasion ${occasionId} to region ${regionId}`;

export const occasionQueryHandlers: QueryHandlersOf<OccasionQueries> = {
  "occasion.findById": (sql, { id }) =>
    findOccasionRecords(sql, [id])[0] ?? null,
  "occasion.findByIds": (sql, { ids }) => findOccasionRecords(sql, ids),
  "occasion.searchForOperation": (sql, { terms, page, limit }) =>
    searchForOperation(sql, terms, page, limit),
  "occasion.findParticipation": (sql, { occasionId, placeId }) => {
    const row = sql
      .exec<ParticipationRow>(
        `SELECT ${PARTICIPATION_COLUMNS} FROM occasion_participations p
          WHERE p.occasion_id = ? AND p.place_id = ?`,
        occasionId,
        placeId,
      )
      .toArray()[0];
    return row === undefined ? null : participationRowToRecord(row);
  },
  "occasion.findParticipationsByOccasion": (sql, { occasionId, page, limit }) =>
    pageOf(
      sql,
      PARTICIPATION_COLUMNS,
      "FROM occasion_participations p WHERE p.occasion_id = ?",
      [occasionId],
      "p.participated_at DESC, p.place_id",
      page,
      limit,
      participationRowToRecord,
    ),
  "occasion.findParticipationsByPlace": (sql, { placeId, page, limit }) =>
    pageOf(
      sql,
      PARTICIPATION_COLUMNS,
      "FROM occasion_participations p WHERE p.place_id = ?",
      [placeId],
      "p.participated_at DESC, p.occasion_id",
      page,
      limit,
      participationRowToRecord,
    ),
  "occasion.findRegionLink": (sql, { occasionId, regionId }) => {
    const row = sql
      .exec<RegionLinkRow>(
        `SELECT ${REGION_LINK_COLUMNS} FROM occasion_region_links l
          WHERE l.occasion_id = ? AND l.region_id = ?`,
        occasionId,
        regionId,
      )
      .toArray()[0];
    return row === undefined ? null : regionLinkRowToRecord(row);
  },
  "occasion.findRegionLinksByOccasion": (sql, { occasionId, page, limit }) =>
    pageOf(
      sql,
      REGION_LINK_COLUMNS,
      "FROM occasion_region_links l WHERE l.occasion_id = ?",
      [occasionId],
      "l.linked_at, l.region_id",
      page,
      limit,
      regionLinkRowToRecord,
    ),
  "occasion.findRegionLinksByRegion": (sql, { regionId, page, limit }) =>
    pageOf(
      sql,
      REGION_LINK_COLUMNS,
      "FROM occasion_region_links l WHERE l.region_id = ?",
      [regionId],
      "l.linked_at DESC, l.occasion_id",
      page,
      limit,
      regionLinkRowToRecord,
    ),
  "occasion.findToObserve": (sql, { today, page, limit }) =>
    findToObserve(sql, today, page, limit),
  "occasion.findHoldingStatus": (sql, { occasionId }) => {
    const row = sql
      .exec<HoldingRow>(
        `SELECT r.occasion_id, r.last_observed, r.observed_version,
                r.next_change_on
           FROM occasion_holding_status_records r
           JOIN occasions o ON o.id = r.occasion_id
          WHERE r.occasion_id = ?`,
        occasionId,
      )
      .toArray()[0];
    return row === undefined ? null : toHoldingRecord(row);
  },
};

export const occasionCommandHandlers: CommandHandlersOf<OccasionCommand> = {
  "occasion.insert": (sql, { record }) =>
    insertUnique(
      sql,
      "occasions",
      { id: record.id, ...occasionValues(record) },
      describeOccasion(record.id),
    ),
  "occasion.save": (sql, { record, expectedVersion }) =>
    updateVersioned(
      sql,
      "occasions",
      { id: record.id },
      occasionValues(record),
      expectedVersion,
      describeOccasion(record.id),
    ),
  "occasion.insertParticipation": (sql, { record }) =>
    insertUnique(
      sql,
      "occasion_participations",
      {
        occasion_id: record.occasionId,
        place_id: record.placeId,
        ...participationValues(record),
      },
      describeParticipation(record.occasionId, record.placeId),
    ),
  "occasion.saveParticipation": (sql, { record, expectedVersion }) =>
    updateVersioned(
      sql,
      "occasion_participations",
      { occasion_id: record.occasionId, place_id: record.placeId },
      participationValues(record),
      expectedVersion,
      describeParticipation(record.occasionId, record.placeId),
    ),
  "occasion.deleteParticipation": (sql, { key, expectedVersion }) =>
    deleteVersioned(
      sql,
      "occasion_participations",
      { occasion_id: key.occasionId, place_id: key.placeId },
      expectedVersion,
      describeParticipation(key.occasionId, key.placeId),
    ),
  "occasion.insertRegionLink": (sql, { record }) =>
    insertUnique(
      sql,
      "occasion_region_links",
      {
        occasion_id: record.occasionId,
        region_id: record.regionId,
        ...regionLinkValues(record),
      },
      describeRegionLink(record.occasionId, record.regionId),
    ),
  "occasion.saveRegionLink": (sql, { record, expectedVersion }) =>
    updateVersioned(
      sql,
      "occasion_region_links",
      { occasion_id: record.occasionId, region_id: record.regionId },
      regionLinkValues(record),
      expectedVersion,
      describeRegionLink(record.occasionId, record.regionId),
    ),
  "occasion.deleteRegionLink": (sql, { key, expectedVersion }) =>
    deleteVersioned(
      sql,
      "occasion_region_links",
      { occasion_id: key.occasionId, region_id: key.regionId },
      expectedVersion,
      describeRegionLink(key.occasionId, key.regionId),
    ),
  "occasion.putHoldingStatus": (sql, { record }) => {
    sql.exec(
      `INSERT INTO occasion_holding_status_records
         (occasion_id, last_observed, observed_version, next_change_on)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (occasion_id) DO UPDATE SET
         last_observed = excluded.last_observed,
         observed_version = excluded.observed_version,
         next_change_on = excluded.next_change_on`,
      record.occasionId,
      record.lastObserved,
      record.observedVersion,
      record.nextChangeOn,
    );
    return APPLIED;
  },
};

/**
 * The `occasion` entry of `STEWARDED_TARGET_LOOKUPS`: stored occasions
 * among `ids` with their names — drafts, unpublished, suspended and
 * cancelled ones included, an unnamed one as `null`.
 */
export const occasionStewardedTargetLookup: StewardedTargetLookup = (
  sql,
  ids,
) =>
  sql
    .exec<Readonly<{ id: string; name: string | null }> & SqlRow>(
      `SELECT id, name FROM occasions
         WHERE id IN (SELECT value FROM json_each(?))`,
      JSON.stringify(ids),
    )
    .toArray()
    .map((row) => ({ id: row.id, name: row.name }));

/**
 * The `occasion` entry of `CONTENT_LOOKUPS`: stored occasions among `ids`
 * with their names and current photos in order, any state.
 */
export const occasionContentLookup: ContentLookup = (sql, ids) =>
  sql
    .exec<
      Readonly<{ id: string; name: string | null; photo_ids: string }> & SqlRow
    >(
      `SELECT id, name, photo_ids FROM occasions
         WHERE id IN (SELECT value FROM json_each(?))`,
      JSON.stringify(ids),
    )
    .toArray()
    .map((row) => ({
      id: row.id,
      name: row.name,
      photoIds: parseStrings(row.photo_ids),
    }));
