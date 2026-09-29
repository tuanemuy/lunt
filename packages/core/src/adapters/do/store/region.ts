import { Address } from "@repo/core/domain/common/address";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import {
  KeywordRelevance,
  SearchKeyword,
} from "@repo/core/domain/common/searchKeyword";
import { Region } from "@repo/core/domain/region/region";
import type {
  PlaceAffiliationsRecord,
  RegionCommand,
  RegionQueries,
  RegionRecord,
} from "../protocol/region";
import type { SqlExec, SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import type { ContentLookup } from "./contentLookups";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import type { StewardedTargetLookup } from "./stewardedTargetLookups";
import { insertUnique, updateVersioned } from "./versioned";

/**
 * Region's tables (version 17). Rows are written only from the aggregate
 * snapshots (`region.insert` / `region.save`,
 * `region.insertPlaceAffiliations` / `region.savePlaceAffiliations`).
 * Other domains' object-side reads (Discovery, the directories) may read
 * them; `REGION_COLUMNS` + `regionRowToRecord` rebuild a `RegionRecord`.
 *
 * `regions`, one row per region:
 *
 * | column | type | meaning |
 * | --- | --- | --- |
 * | `id` | TEXT PK | `RegionId` |
 * | `publication_status` | TEXT | `draft` / `published` / `unpublished` |
 * | `first_published_at` | INTEGER NULL | epoch ms of the first publication (`NULL` for a draft); orders 「新しい順」 |
 * | `unpublish_reason` | TEXT NULL | `byManager` / `photoTakedown` (unpublished only) |
 * | `suspended` | INTEGER 0/1 | `Suspension.suspended` (運営による非公開) |
 * | `name` | TEXT NULL | `RegionName` |
 * | `area_code`, `prefecture`, `municipality`, `town`, `address_rest` | TEXT NULL | `Address` (all `NULL` when no address); `Address.text` joins the last four in this order |
 * | `latitude`, `longitude` | REAL NULL | `GeoPoint` (both `NULL` when no location) |
 * | `photo_ids` | TEXT | JSON array of `PhotoId`s in display order (first = cover) |
 * | `photos_taken_down` | INTEGER 0/1 | `PhotoSet.takenDown` |
 * | `description` | TEXT NULL | `RegionDescription` |
 * | `tagline` | TEXT NULL | `Tagline` |
 * | `updated_at` | INTEGER | epoch ms |
 * | `version` | INTEGER | optimistic-lock version |
 *
 * A region is viewable (`VisibilityPolicy.isRegionViewable`) exactly when
 * `publication_status = 'published' AND suspended = 0`.
 *
 * `place_affiliations`, one row per place that was ever affiliated:
 *
 * | column | type | meaning |
 * | --- | --- | --- |
 * | `place_id` | TEXT PK | `PlaceId` |
 * | `affiliations` | TEXT | JSON `[{ "regionId", "affiliatedAt" (epoch ms) }]` in first-affiliated order |
 * | `chosen_representative` | TEXT NULL | the `RegionId` the manager chose (`NULL`: none chosen) |
 * | `updated_at` | INTEGER | epoch ms |
 * | `version` | INTEGER | optimistic-lock version |
 *
 * `region_affiliations` is the reverse index of the current affiliations,
 * rebuilt from the snapshot on every write — one row per (region, place)
 * with `affiliated_at` (epoch ms). Join it for "the places of a region"
 * or "the regions of a place"; the representative and the displayed
 * region follow `PlaceAffiliations.representative` / `displayedRegion`
 * over `place_affiliations`.
 */
const REGION_TABLES_MIGRATION: Migration = {
  version: 17,
  name: "regions and place affiliations",
  statements: [
    `CREATE TABLE regions (
      id TEXT PRIMARY KEY,
      publication_status TEXT NOT NULL,
      first_published_at INTEGER,
      unpublish_reason TEXT,
      suspended INTEGER NOT NULL,
      name TEXT,
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
    `CREATE INDEX idx_regions_viewable
       ON regions (first_published_at, id)
       WHERE publication_status = 'published' AND suspended = 0`,
    `CREATE TABLE place_affiliations (
      place_id TEXT PRIMARY KEY,
      affiliations TEXT NOT NULL,
      chosen_representative TEXT,
      updated_at INTEGER NOT NULL,
      version INTEGER NOT NULL
    )`,
    `CREATE TABLE region_affiliations (
      region_id TEXT NOT NULL,
      place_id TEXT NOT NULL,
      affiliated_at INTEGER NOT NULL,
      PRIMARY KEY (region_id, place_id)
    )`,
    `CREATE INDEX idx_region_affiliations_newest
       ON region_affiliations (region_id, affiliated_at DESC, place_id)`,
    `CREATE INDEX idx_region_affiliations_place
       ON region_affiliations (place_id)`,
  ],
};

/**
 * Region's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Region has 17; take the next free number across all
 * domains for any later migration.
 */
export const REGION_MIGRATIONS: readonly Migration[] = [
  REGION_TABLES_MIGRATION,
];

export type RegionRow = Readonly<{
  id: string;
  publication_status: string;
  first_published_at: number | null;
  unpublish_reason: string | null;
  suspended: number;
  name: string | null;
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

/** Every column of `regions`, for `SELECT ${REGION_COLUMNS} FROM regions`. */
export const REGION_COLUMNS = `id, publication_status, first_published_at,
  unpublish_reason, suspended, name, area_code, prefecture, municipality,
  town, address_rest, latitude, longitude, photo_ids, photos_taken_down,
  description, tagline, updated_at, version`;

/**
 * `photo_ids` as stored — the parsed JSON, or the text itself when it is
 * not JSON — unchecked: the request side refuses anything but an array of
 * photo ids as a data-integrity failure.
 */
const photoIdsOf = (raw: string): RegionRecord["content"]["photoIds"] => {
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    stored = raw;
  }
  return stored as RegionRecord["content"]["photoIds"];
};

function addressOf(row: RegionRow): RegionRecord["content"]["address"] {
  if (
    row.area_code === null ||
    row.prefecture === null ||
    row.municipality === null ||
    row.town === null ||
    row.address_rest === null
  ) {
    return null;
  }
  return {
    areaCode: row.area_code,
    prefecture: row.prefecture,
    municipality: row.municipality,
    town: row.town,
    rest: row.address_rest,
  };
}

export const regionRowToRecord = (row: RegionRow): RegionRecord => ({
  id: row.id,
  publication: {
    status: row.publication_status,
    firstPublishedAt:
      row.first_published_at === null ? null : Number(row.first_published_at),
    reason: row.unpublish_reason,
  },
  suspended: Number(row.suspended) === 1,
  content: {
    name: row.name,
    address: addressOf(row),
    location:
      row.latitude === null || row.longitude === null
        ? null
        : { latitude: Number(row.latitude), longitude: Number(row.longitude) },
    photoIds: photoIdsOf(row.photo_ids),
    photosTakenDown: Number(row.photos_taken_down) === 1,
    description: row.description,
    tagline: row.tagline,
  },
  updatedAt: Number(row.updated_at),
  version: Number(row.version),
});

const regionValues = (record: RegionRecord) => {
  const { publication, content } = record;
  return {
    publication_status: publication.status,
    first_published_at: publication.firstPublishedAt,
    unpublish_reason: publication.reason,
    suspended: record.suspended ? 1 : 0,
    name: content.name,
    area_code: content.address?.areaCode ?? null,
    prefecture: content.address?.prefecture ?? null,
    municipality: content.address?.municipality ?? null,
    town: content.address?.town ?? null,
    address_rest: content.address?.rest ?? null,
    latitude: content.location?.latitude ?? null,
    longitude: content.location?.longitude ?? null,
    photo_ids: JSON.stringify(content.photoIds),
    photos_taken_down: content.photosTakenDown ? 1 : 0,
    description: content.description,
    tagline: content.tagline,
    updated_at: record.updatedAt,
    version: record.version,
  };
};

/** Stored regions among `ids` (at most 100), in id order. */
export function readRegionRecords(
  sql: SqlExec,
  ids: readonly string[],
): readonly RegionRecord[] {
  if (ids.length === 0) return [];
  return sql
    .exec<RegionRow>(
      `SELECT ${REGION_COLUMNS} FROM regions
         WHERE id IN (SELECT value FROM json_each(?))
         ORDER BY id`,
      JSON.stringify(ids),
    )
    .toArray()
    .map(regionRowToRecord);
}

const byCodePoint = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

type SearchRow = Readonly<{
  id: string;
  name: string | null;
  tagline: string | null;
  description: string | null;
  area_code: string | null;
  prefecture: string | null;
  municipality: string | null;
  town: string | null;
  address_rest: string | null;
}> &
  SqlRow;

const searchAddress = (row: SearchRow): Address | null =>
  row.area_code === null ||
  row.prefecture === null ||
  row.municipality === null ||
  row.town === null ||
  row.address_rest === null
    ? null
    : Address.of(
        {
          areaCode: AreaCode.create(row.area_code),
          prefecture: row.prefecture,
          municipality: row.municipality,
          town: row.town,
        },
        row.address_rest,
      );

/**
 * `KeywordRelevance` over `Region.searchableTextOf` of every region,
 * computed here rather than in SQL so the result does not depend on the
 * store's collation or text functions.
 */
function searchForOperation(
  sql: SqlExec,
  terms: readonly string[],
  page: number,
  limit: number,
): Readonly<{ items: readonly RegionRecord[]; count: number }> {
  const keyword = SearchKeyword.parse(terms.join(" "));
  if (keyword === null) return { items: [], count: 0 };
  const ranked = sql
    .exec<SearchRow>(
      `SELECT id, name, tagline, description, area_code, prefecture,
              municipality, town, address_rest
         FROM regions`,
    )
    .toArray()
    .map((row) => ({
      id: row.id,
      relevance: KeywordRelevance.relevance(
        Region.searchableTextOf({
          name: row.name,
          tagline: row.tagline,
          description: row.description,
          address: searchAddress(row),
        }),
        keyword,
      ),
    }))
    .filter((entry) => entry.relevance >= 1)
    .sort((a, b) => b.relevance - a.relevance || byCodePoint(a.id, b.id));
  const pageIds = ranked
    .slice((page - 1) * limit, page * limit)
    .map((entry) => entry.id);
  const records = new Map(
    readRegionRecords(sql, pageIds).map((record) => [record.id, record]),
  );
  return {
    items: pageIds.flatMap((id) => {
      const record = records.get(id);
      return record === undefined ? [] : [record];
    }),
    count: ranked.length,
  };
}

type AffiliationsRow = Readonly<{
  place_id: string;
  affiliations: string;
  chosen_representative: string | null;
  updated_at: number;
  version: number;
}> &
  SqlRow;

const affiliationsOf = (
  raw: string,
): PlaceAffiliationsRecord["affiliations"] => {
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    stored = raw;
  }
  return stored as PlaceAffiliationsRecord["affiliations"];
};

const affiliationsValues = (record: PlaceAffiliationsRecord) => ({
  affiliations: JSON.stringify(record.affiliations),
  chosen_representative: record.chosenRepresentative,
  updated_at: record.updatedAt,
  version: record.version,
});

/** Rebuilds the place's rows of the reverse index from its snapshot. */
function indexAffiliations(sql: SqlExec, record: PlaceAffiliationsRecord) {
  sql.exec(
    "DELETE FROM region_affiliations WHERE place_id = ?",
    record.placeId,
  );
  if (record.affiliations.length === 0) return;
  sql.exec(
    `INSERT INTO region_affiliations (region_id, place_id, affiliated_at)
       SELECT json_extract(value, '$.regionId'), ?,
              json_extract(value, '$.affiliatedAt')
         FROM json_each(?)`,
    record.placeId,
    JSON.stringify(record.affiliations),
  );
}

const describeRegion = (id: string): string => `Region ${id}`;
const describeAffiliations = (placeId: string): string =>
  `Affiliations of place ${placeId}`;

type CountRow = Readonly<{ n: number }> & SqlRow;

export const regionQueryHandlers: QueryHandlersOf<RegionQueries> = {
  "region.findById": (sql, { id }) => readRegionRecords(sql, [id])[0] ?? null,
  "region.findByIds": (sql, { ids }) => readRegionRecords(sql, ids),
  "region.searchForOperation": (sql, { terms, page, limit }) =>
    searchForOperation(sql, terms, page, limit),
  "region.findPlaceAffiliations": (sql, { placeId }) => {
    const row = sql
      .exec<AffiliationsRow>(
        `SELECT place_id, affiliations, chosen_representative, updated_at,
                version
           FROM place_affiliations WHERE place_id = ?`,
        placeId,
      )
      .toArray()[0];
    if (row === undefined) return null;
    return {
      placeId: row.place_id,
      affiliations: affiliationsOf(row.affiliations),
      chosenRepresentative: row.chosen_representative,
      updatedAt: Number(row.updated_at),
      version: Number(row.version),
    };
  },
  "region.findAffiliatedPlaces": (sql, { regionId, page, limit }) => {
    const items = sql
      .exec<Readonly<{ place_id: string }> & SqlRow>(
        `SELECT place_id FROM region_affiliations
           WHERE region_id = ?
           ORDER BY affiliated_at DESC, place_id
           LIMIT ? OFFSET ?`,
        regionId,
        limit,
        (page - 1) * limit,
      )
      .toArray()
      .map((row) => row.place_id);
    const count = sql
      .exec<CountRow>(
        "SELECT COUNT(*) AS n FROM region_affiliations WHERE region_id = ?",
        regionId,
      )
      .toArray()[0];
    return { items, count: Number(count?.n ?? 0) };
  },
};

function afterApplied<T extends { kind: string }>(
  outcome: T,
  index: () => void,
): T {
  if (outcome.kind === "applied") index();
  return outcome;
}

export const regionCommandHandlers: CommandHandlersOf<RegionCommand> = {
  "region.insert": (sql, { record }) =>
    insertUnique(
      sql,
      "regions",
      { id: record.id, ...regionValues(record) },
      describeRegion(record.id),
    ),
  "region.save": (sql, { record, expectedVersion }) =>
    updateVersioned(
      sql,
      "regions",
      { id: record.id },
      regionValues(record),
      expectedVersion,
      describeRegion(record.id),
    ),
  "region.insertPlaceAffiliations": (sql, { record }) =>
    afterApplied(
      insertUnique(
        sql,
        "place_affiliations",
        { place_id: record.placeId, ...affiliationsValues(record) },
        describeAffiliations(record.placeId),
      ),
      () => indexAffiliations(sql, record),
    ),
  "region.savePlaceAffiliations": (sql, { record, expectedVersion }) =>
    afterApplied(
      updateVersioned(
        sql,
        "place_affiliations",
        { place_id: record.placeId },
        affiliationsValues(record),
        expectedVersion,
        describeAffiliations(record.placeId),
      ),
      () => indexAffiliations(sql, record),
    ),
};

/**
 * The `region` entry of `STEWARDED_TARGET_LOOKUPS`: stored regions among
 * `ids` with their names — drafts, unpublished and suspended ones
 * included, an unnamed one as `null`.
 */
export const regionStewardedTargetLookup: StewardedTargetLookup = (sql, ids) =>
  sql
    .exec<Readonly<{ id: string; name: string | null }> & SqlRow>(
      `SELECT id, name FROM regions
         WHERE id IN (SELECT value FROM json_each(?))`,
      JSON.stringify(ids),
    )
    .toArray()
    .map((row) => ({ id: row.id, name: row.name }));

/**
 * The `region` entry of `CONTENT_LOOKUPS`: stored regions among `ids` with
 * their names and current photos in order, any state.
 */
export const regionContentLookup: ContentLookup = (sql, ids) =>
  readRegionRecords(sql, ids).map((record) => ({
    id: record.id,
    name: record.content.name,
    photoIds: record.content.photoIds,
  }));
