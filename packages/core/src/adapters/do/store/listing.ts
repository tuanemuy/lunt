import {
  KeywordRelevance,
  SearchKeyword,
} from "@repo/core/domain/common/searchKeyword";
import { ListingMatching } from "@repo/core/domain/listing/listingMatching";
import type {
  CategoryCatalogRecord,
  DriftedListingPage,
  ListingCommand,
  ListingPage,
  ListingQueries,
  ListingRecord,
  ListingScheduleRecord,
  ListingShelfCountsRecord,
  OfferingPhaseRecordRecord,
  OfferingRecord,
} from "../protocol/listing";
import type { SqlExec, SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import type { ContentLookup } from "./contentLookups";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import {
  APPLIED,
  deleteVersioned,
  insertUnique,
  updateVersioned,
} from "./versioned";

/**
 * Listing's tables (version 12). Other domains' queries (Discovery) read
 * `listings` directly; its columns are:
 *
 * - `publication_status` `draft` | `published` | `unpublished`;
 *   `first_published_at` (epoch ms, `NULL` for a draft);
 *   `unpublish_reason` `byManager` | `photoTakedown` (unpublished only).
 * - `suspended` 0 / 1 (operator suspension). `manual_ended` 0 / 1, `NULL`
 *   for a draft (reads as 0).
 * - `name`, `description`, `category_id`: the stored content (`NULL` when
 *   empty); `category_id` is stored, not resolved — expand a filter with
 *   `CategoryCatalog.predecessorsOf`.
 * - `photos`: JSON `[{ "photoId", "framing": { x, y, width, height } | null }]`,
 *   the first is the cover; `photos_taken_down` 0 / 1.
 * - `offering`: JSON `{ kind: "none" } | { kind: "period", start, end } |
 *   { kind: "dates", dates }`, days as `YYYY-MM-DD`.
 * - `starts_on` / `last_available_on`: `Offering.startsOn` /
 *   `Offering.lastAvailableOn` of the stored offering (`YYYY-MM-DD` or
 *   `NULL`). On a day `T` a listing is `ended` when `manual_ended = 1` or
 *   `last_available_on < T`; else `upcoming` when `starts_on > T`; else
 *   `available` (`LISTING_PHASE_SQL`).
 * - `updated_at` (epoch ms), `version`.
 *
 * `deleted_listings` remembers deleted ids so an insert of one conflicts.
 * `category_catalog` holds the one catalog (`singleton = 1`), its
 * categories as JSON in creation order. `offering_phase_records` is the
 * `OfferingPhaseLedger`, one row per listing id, not tied to the listing
 * row (a record of a deleted listing stays, unread).
 */
const LISTING_TABLES_MIGRATION: Migration = {
  version: 12,
  name: "listings, category catalog and offering phase records",
  statements: [
    `CREATE TABLE listings (
      id TEXT PRIMARY KEY,
      place_id TEXT NOT NULL,
      publication_status TEXT NOT NULL,
      first_published_at INTEGER,
      unpublish_reason TEXT,
      suspended INTEGER NOT NULL,
      manual_ended INTEGER,
      name TEXT,
      description TEXT,
      category_id TEXT,
      photos TEXT NOT NULL,
      photos_taken_down INTEGER NOT NULL,
      offering TEXT NOT NULL,
      starts_on TEXT,
      last_available_on TEXT,
      updated_at INTEGER NOT NULL,
      version INTEGER NOT NULL
    )`,
    `CREATE INDEX idx_listings_place
       ON listings (place_id, updated_at DESC, id)`,
    "CREATE INDEX idx_listings_category ON listings (category_id, id)",
    `CREATE INDEX idx_listings_published
       ON listings (id) WHERE publication_status = 'published'`,
    "CREATE TABLE deleted_listings (id TEXT PRIMARY KEY)",
    `CREATE TABLE category_catalog (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      categories TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      version INTEGER NOT NULL
    )`,
    `CREATE TABLE offering_phase_records (
      listing_id TEXT PRIMARY KEY,
      phase TEXT NOT NULL,
      observed_version INTEGER NOT NULL,
      next_change_on TEXT
    )`,
  ],
};

/**
 * Listing's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Listing starts at 12; take the next free number across all
 * domains for any later migration.
 */
export const LISTING_MIGRATIONS: readonly Migration[] = [
  LISTING_TABLES_MIGRATION,
];

/**
 * The offering phase of `listings l` on the day bound twice (`?`, `?`),
 * from the stored days and the manual end only.
 */
export const LISTING_PHASE_SQL = `CASE
  WHEN l.manual_ended = 1
    OR (l.last_available_on IS NOT NULL AND l.last_available_on < ?)
    THEN 'ended'
  WHEN l.starts_on IS NOT NULL AND l.starts_on > ? THEN 'upcoming'
  ELSE 'available' END`;

/** The publication shelf of `listings l` (`Listing.publicationShelf`). */
export const LISTING_SHELF_SQL = `CASE
  WHEN l.suspended = 1 OR l.publication_status = 'unpublished' THEN 'hidden'
  WHEN l.publication_status = 'published' THEN 'published'
  ELSE 'draft' END`;

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

type CountRow = Readonly<{ n: number }> & SqlRow;

const COLUMNS = `l.id, l.place_id, l.publication_status, l.first_published_at,
  l.unpublish_reason, l.suspended, l.manual_ended, l.name, l.description,
  l.category_id, l.photos, l.photos_taken_down, l.offering, l.updated_at,
  l.version`;

const NEWEST_FIRST = "l.updated_at DESC, l.id";

function toRecord(row: ListingRow): ListingRecord {
  return {
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
      photos: JSON.parse(row.photos) as ListingRecord["content"]["photos"],
      photosTakenDown: Number(row.photos_taken_down) === 1,
      offering: JSON.parse(row.offering) as OfferingRecord,
    },
    updatedAt: new Date(Number(row.updated_at)),
    version: Number(row.version),
  };
}

const flag = (value: boolean): number => (value ? 1 : 0);

const mutableValues = (
  record: ListingRecord,
  schedule: ListingScheduleRecord,
) => ({
  publication_status: record.publication.status,
  first_published_at: record.publication.firstPublishedAt?.getTime() ?? null,
  unpublish_reason: record.publication.reason,
  suspended: flag(record.suspended),
  manual_ended: record.manualEnded === null ? null : flag(record.manualEnded),
  name: record.content.name,
  description: record.content.description,
  category_id: record.content.categoryId,
  photos: JSON.stringify(record.content.photos),
  photos_taken_down: flag(record.content.photosTakenDown),
  offering: JSON.stringify(record.content.offering),
  starts_on: schedule.startsOn,
  last_available_on: schedule.lastAvailableOn,
  updated_at: record.updatedAt.getTime(),
  version: record.version,
});

/**
 * One page of `SELECT … {from}` in `order`, and the total. `from` and
 * `order` are this module's own SQL text, never input.
 */
function pageOf(
  sql: SqlExec,
  from: string,
  bindings: readonly unknown[],
  order: string,
  page: number,
  limit: number,
): ListingPage {
  const items = sql
    .exec<ListingRow>(
      `SELECT ${COLUMNS} ${from} ORDER BY ${order} LIMIT ? OFFSET ?`,
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

function findByIds(sql: SqlExec, ids: readonly string[]): ListingRecord[] {
  if (ids.length === 0) return [];
  return sql
    .exec<ListingRow>(
      `SELECT ${COLUMNS} FROM listings l
         WHERE l.id IN (SELECT value FROM json_each(?))`,
      JSON.stringify(ids),
    )
    .toArray()
    .map(toRecord);
}

const byCodePoint = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * `KeywordRelevance` over `ListingMatching.textOf` of every listing,
 * computed here rather than in SQL so the result does not depend on the
 * store's collation or text functions.
 */
function searchForOperation(
  sql: SqlExec,
  terms: readonly string[],
  page: number,
  limit: number,
): ListingPage {
  const keyword = SearchKeyword.parse(terms.join(" "));
  if (keyword === null) return { items: [], count: 0 };
  const ranked = sql
    .exec<
      Readonly<{
        id: string;
        name: string | null;
        description: string | null;
      }> &
        SqlRow
    >("SELECT id, name, description FROM listings")
    .toArray()
    .map((row) => ({
      id: row.id,
      relevance: KeywordRelevance.relevance(
        ListingMatching.textOf(row.name, row.description),
        keyword,
      ),
    }))
    .filter((entry) => entry.relevance >= 1)
    .sort((a, b) => b.relevance - a.relevance || byCodePoint(a.id, b.id));
  const pageIds = ranked
    .slice((page - 1) * limit, page * limit)
    .map((entry) => entry.id);
  const records = new Map(
    findByIds(sql, pageIds).map((record) => [record.id, record]),
  );
  return {
    items: pageIds.flatMap((id) => {
      const record = records.get(id);
      return record === undefined ? [] : [record];
    }),
    count: ranked.length,
  };
}

type CatalogRow = Readonly<{
  categories: string;
  updated_at: number;
  version: number;
}> &
  SqlRow;

type PhaseRecordRow = Readonly<{
  listing_id: string;
  phase: string;
  observed_version: number;
  next_change_on: string | null;
}> &
  SqlRow;

const toPhaseRecord = (row: PhaseRecordRow): OfferingPhaseRecordRecord => ({
  listingId: row.listing_id,
  phase: row.phase,
  observedVersion: Number(row.observed_version),
  nextChangeOn: row.next_change_on,
});

const DRIFTED_FROM = `FROM listings l
  LEFT JOIN offering_phase_records r ON r.listing_id = l.id
  WHERE l.publication_status = 'published'
    AND (r.listing_id IS NULL
      OR r.observed_version <> l.version
      OR (r.next_change_on IS NOT NULL AND r.next_change_on <= ?))`;

function findDrifted(
  sql: SqlExec,
  today: string,
  page: number,
  limit: number,
): DriftedListingPage {
  const items = sql
    .exec<ListingRow & Readonly<{ recorded: string | null }>>(
      `SELECT ${COLUMNS}, r.phase AS recorded ${DRIFTED_FROM}
         ORDER BY l.id LIMIT ? OFFSET ?`,
      today,
      limit,
      (page - 1) * limit,
    )
    .toArray()
    .map((row) => ({ listing: toRecord(row), recorded: row.recorded }));
  const count = sql
    .exec<CountRow>(`SELECT COUNT(*) AS n ${DRIFTED_FROM}`, today)
    .toArray()[0];
  return { items, count: Number(count?.n ?? 0) };
}

function countByPlace(
  sql: SqlExec,
  placeId: string,
  today: string,
): ListingShelfCountsRecord {
  const publication = { published: 0, draft: 0, hidden: 0 };
  const phase = { upcoming: 0, available: 0, ended: 0 };
  const rows = sql
    .exec<Readonly<{ shelf: string; phase: string; n: number }> & SqlRow>(
      `SELECT ${LISTING_SHELF_SQL} AS shelf, ${LISTING_PHASE_SQL} AS phase,
              COUNT(*) AS n
         FROM listings l WHERE l.place_id = ?
        GROUP BY shelf, phase`,
      today,
      today,
      placeId,
    )
    .toArray();
  for (const row of rows) {
    const n = Number(row.n);
    if (
      row.shelf === "published" ||
      row.shelf === "draft" ||
      row.shelf === "hidden"
    ) {
      publication[row.shelf] += n;
    }
    if (
      row.phase === "upcoming" ||
      row.phase === "available" ||
      row.phase === "ended"
    ) {
      phase[row.phase] += n;
    }
  }
  return { publication, phase };
}

const describeListing = (id: string): string => `Listing ${id}`;

export const listingQueryHandlers: QueryHandlersOf<ListingQueries> = {
  "listing.findById": (sql, { id }) => findByIds(sql, [id])[0] ?? null,
  "listing.isDeleted": (sql, { id }) =>
    sql.exec("SELECT 1 AS ok FROM deleted_listings WHERE id = ?", id).toArray()
      .length > 0,
  "listing.findByIds": (sql, { ids }) => findByIds(sql, ids),
  "listing.findPageByPlace": (sql, { placeId, shelf, today, page, limit }) =>
    pageOf(
      sql,
      `FROM listings l
        WHERE l.place_id = ?
          AND (? IS NULL OR ${LISTING_SHELF_SQL} = ?)
          AND (? IS NULL OR ${LISTING_PHASE_SQL} = ?)`,
      [
        placeId,
        shelf.publication,
        shelf.publication,
        shelf.phase,
        today,
        today,
        shelf.phase,
      ],
      NEWEST_FIRST,
      page,
      limit,
    ),
  "listing.countByPlace": (sql, { placeId, today }) =>
    countByPlace(sql, placeId, today),
  "listing.findPageAttachable": (sql, { placeId, page, limit }) =>
    pageOf(
      sql,
      `FROM listings l
        WHERE l.place_id = ?
          AND l.publication_status = 'published' AND l.suspended = 0`,
      [placeId],
      NEWEST_FIRST,
      page,
      limit,
    ),
  "listing.findPageByCategories": (sql, { categoryIds, page, limit }) => {
    if (categoryIds.length === 0) return { items: [], count: 0 };
    return pageOf(
      sql,
      `FROM listings l
        WHERE l.category_id IN (SELECT value FROM json_each(?))`,
      [JSON.stringify(categoryIds)],
      "l.id",
      page,
      limit,
    );
  },
  "listing.searchForOperation": (sql, { terms, page, limit }) =>
    searchForOperation(sql, terms, page, limit),
  "listing.findCategoryCatalog": (sql) => {
    const row = sql
      .exec<CatalogRow>(
        "SELECT categories, updated_at, version FROM category_catalog WHERE singleton = 1",
      )
      .toArray()[0];
    if (row === undefined) return null;
    return {
      categories: JSON.parse(
        row.categories,
      ) as CategoryCatalogRecord["categories"],
      updatedAt: new Date(Number(row.updated_at)),
      version: Number(row.version),
    };
  },
  "listing.findDrifted": (sql, { today, page, limit }) =>
    findDrifted(sql, today, page, limit),
  "listing.findOfferingPhase": (sql, { listingId }) => {
    const row = sql
      .exec<PhaseRecordRow>(
        `SELECT r.listing_id, r.phase, r.observed_version, r.next_change_on
           FROM offering_phase_records r
           JOIN listings l ON l.id = r.listing_id
          WHERE r.listing_id = ?`,
        listingId,
      )
      .toArray()[0];
    return row === undefined ? null : toPhaseRecord(row);
  },
};

const catalogValues = (record: CategoryCatalogRecord) => ({
  categories: JSON.stringify(record.categories),
  updated_at: record.updatedAt.getTime(),
  version: record.version,
});

export const listingCommandHandlers: CommandHandlersOf<ListingCommand> = {
  "listing.insert": (sql, { record, schedule }) => {
    const deleted =
      sql
        .exec("SELECT 1 AS ok FROM deleted_listings WHERE id = ?", record.id)
        .toArray().length > 0;
    if (deleted) {
      return {
        kind: "conflict",
        code: "UNIQUE_VIOLATION",
        message: `${describeListing(record.id)} was deleted`,
      };
    }
    return insertUnique(
      sql,
      "listings",
      {
        id: record.id,
        place_id: record.placeId,
        ...mutableValues(record, schedule),
      },
      describeListing(record.id),
    );
  },
  "listing.save": (sql, { record, schedule, expectedVersion }) =>
    updateVersioned(
      sql,
      "listings",
      { id: record.id },
      mutableValues(record, schedule),
      expectedVersion,
      describeListing(record.id),
    ),
  "listing.delete": (sql, { id, expectedVersion }) => {
    const outcome = deleteVersioned(
      sql,
      "listings",
      { id },
      expectedVersion,
      describeListing(id),
    );
    if (outcome.kind === "applied") {
      sql.exec("INSERT OR IGNORE INTO deleted_listings (id) VALUES (?)", id);
    }
    return outcome;
  },
  "listing.saveCategoryCatalog": (sql, { record, expectedVersion }) =>
    expectedVersion === null
      ? insertUnique(
          sql,
          "category_catalog",
          { singleton: 1, ...catalogValues(record) },
          "The category catalog",
        )
      : updateVersioned(
          sql,
          "category_catalog",
          { singleton: 1 },
          catalogValues(record),
          expectedVersion,
          "The category catalog",
        ),
  "listing.recordOfferingPhase": (sql, { record }) => {
    sql.exec(
      `INSERT INTO offering_phase_records
         (listing_id, phase, observed_version, next_change_on)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (listing_id) DO UPDATE SET
         phase = excluded.phase,
         observed_version = excluded.observed_version,
         next_change_on = excluded.next_change_on`,
      record.listingId,
      record.phase,
      record.observedVersion,
      record.nextChangeOn,
    );
    return APPLIED;
  },
  "listing.removeOfferingPhase": (sql, { listingId }) => {
    sql.exec(
      "DELETE FROM offering_phase_records WHERE listing_id = ?",
      listingId,
    );
    return APPLIED;
  },
};

/**
 * `ContentDirectory`'s lookup of listings: existing ones among `ids`, any
 * state, with the name and the current photos in order.
 */
export const listingContentLookup: ContentLookup = (sql, ids) =>
  sql
    .exec<
      Readonly<{ id: string; name: string | null; photos: string }> & SqlRow
    >(
      `SELECT id, name, photos FROM listings
        WHERE id IN (SELECT value FROM json_each(?))`,
      JSON.stringify(ids),
    )
    .toArray()
    .map((row) => ({
      id: row.id,
      name: row.name,
      photoIds: (
        JSON.parse(row.photos) as readonly Readonly<{ photoId: string }>[]
      ).map((photo) => photo.photoId),
    }));
