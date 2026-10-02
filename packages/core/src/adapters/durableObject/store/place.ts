import { Address } from "@repo/core/domain/common/address";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import {
  type MatchableFields,
  PlaceMatchCriteria,
  PlaceMatching,
} from "@repo/core/domain/place/matching";
import { Place } from "@repo/core/domain/place/place";
import type {
  PlaceCommand,
  PlaceQueries,
  PlaceRecord,
} from "../protocol/place";
import type { SqlExec, SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import type { ContentLookup } from "./contentLookups";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import { afterApplied, putSearchText, searchTextOf } from "./searchText";
import type { StewardedTargetLookup } from "./stewardedTargetLookups";
import { insertUnique, updateVersioned } from "./versioned";

/**
 * `places`: one row per place, written only from the aggregate snapshot
 * (`place.insert` / `place.save`). Other domains' object-side reads
 * (Discovery, the directories) may read it; `PLACE_COLUMNS` +
 * `placeRowToRecord` rebuild a `PlaceRecord` from a row.
 *
 * | column | type | meaning |
 * | --- | --- | --- |
 * | `id` | TEXT PK | `PlaceId` |
 * | `name` | TEXT | `PlaceName` (trimmed, non-empty) |
 * | `photo_ids` | TEXT | JSON array of `PhotoId`s in display order (first = cover) |
 * | `photos_taken_down` | INTEGER 0/1 | `PhotoSet.takenDown` |
 * | `description` | TEXT NULL | `PlaceDescription` |
 * | `area_code` | TEXT | `Address.areaCode` (7 digits) — the place's area |
 * | `prefecture`, `municipality`, `town`, `address_rest` | TEXT | the rest of `Address`; `Address.text` joins them in this order |
 * | `latitude`, `longitude` | REAL | `GeoPoint` |
 * | `business_hours`, `contact` | TEXT NULL | `VisitInfo` |
 * | `operating_status` | TEXT | `open` / `temporarilyClosed` / `permanentlyClosed` |
 * | `suspended` | INTEGER 0/1 | `Suspension.suspended` (運営による非公開) |
 * | `registered_at`, `updated_at` | INTEGER | epoch ms; `registered_at` orders 「新しい順」 |
 * | `version` | INTEGER | optimistic-lock version |
 */
const PLACE_TABLE_MIGRATION: Migration = {
  version: 11,
  name: "places",
  statements: [
    `CREATE TABLE places (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      photo_ids TEXT NOT NULL,
      photos_taken_down INTEGER NOT NULL,
      description TEXT,
      area_code TEXT NOT NULL,
      prefecture TEXT NOT NULL,
      municipality TEXT NOT NULL,
      town TEXT NOT NULL,
      address_rest TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      business_hours TEXT,
      contact TEXT,
      operating_status TEXT NOT NULL,
      suspended INTEGER NOT NULL,
      registered_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      version INTEGER NOT NULL
    )`,
    "CREATE INDEX idx_places_registered_at ON places (registered_at, id)",
    "CREATE INDEX idx_places_area_code ON places (area_code)",
    "CREATE INDEX idx_places_location ON places (latitude, longitude)",
  ],
};

/**
 * Place's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Place has 11; take the next free number across all
 * domains for any later migration.
 */
export const PLACE_MIGRATIONS: readonly Migration[] = [PLACE_TABLE_MIGRATION];

export type PlaceRow = Readonly<{
  id: string;
  name: string;
  photo_ids: string;
  photos_taken_down: number;
  description: string | null;
  area_code: string;
  prefecture: string;
  municipality: string;
  town: string;
  address_rest: string;
  latitude: number;
  longitude: number;
  business_hours: string | null;
  contact: string | null;
  operating_status: string;
  suspended: number;
  registered_at: number;
  updated_at: number;
  version: number;
}> &
  SqlRow;

/** Every column of `places`, for `SELECT ${PLACE_COLUMNS} FROM places p`-style reads. */
export const PLACE_COLUMNS = `id, name, photo_ids, photos_taken_down,
  description, area_code, prefecture, municipality, town, address_rest,
  latitude, longitude, business_hours, contact, operating_status,
  suspended, registered_at, updated_at, version`;

/**
 * `photo_ids` as stored — the parsed JSON, or the text itself when it is
 * not JSON — unchecked like every value the store passes through:
 * `DoPlaceRepository.toPlace` refuses anything but an array of photo ids
 * as a data-integrity failure rather than the store repairing it.
 */
const photoIdsOf = (raw: string): PlaceRecord["photoIds"] => {
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    stored = raw;
  }
  return stored as PlaceRecord["photoIds"];
};

export const placeRowToRecord = (row: PlaceRow): PlaceRecord => ({
  id: row.id,
  name: row.name,
  photoIds: photoIdsOf(row.photo_ids),
  photosTakenDown: Number(row.photos_taken_down) === 1,
  description: row.description,
  address: {
    areaCode: row.area_code,
    prefecture: row.prefecture,
    municipality: row.municipality,
    town: row.town,
    rest: row.address_rest,
  },
  location: {
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  },
  businessHours: row.business_hours,
  contact: row.contact,
  operatingStatus: row.operating_status,
  suspended: Number(row.suspended) === 1,
  registeredAt: Number(row.registered_at),
  updatedAt: Number(row.updated_at),
  version: Number(row.version),
});

const values = (record: PlaceRecord) => ({
  name: record.name,
  photo_ids: JSON.stringify(record.photoIds),
  photos_taken_down: record.photosTakenDown ? 1 : 0,
  description: record.description,
  area_code: record.address.areaCode,
  prefecture: record.address.prefecture,
  municipality: record.address.municipality,
  town: record.address.town,
  address_rest: record.address.rest,
  latitude: record.location.latitude,
  longitude: record.location.longitude,
  business_hours: record.businessHours,
  contact: record.contact,
  operating_status: record.operatingStatus,
  suspended: record.suspended ? 1 : 0,
  registered_at: record.registeredAt,
  updated_at: record.updatedAt,
  version: record.version,
});

/** Stored places among `ids` (at most 100), in id order. */
export function readPlaceRecords(
  sql: SqlExec,
  ids: readonly string[],
): readonly PlaceRecord[] {
  if (ids.length === 0) return [];
  return sql
    .exec<PlaceRow>(
      `SELECT ${PLACE_COLUMNS} FROM places
         WHERE id IN (SELECT value FROM json_each(?))
         ORDER BY id`,
      JSON.stringify(ids),
    )
    .toArray()
    .map(placeRowToRecord);
}

/** The texts `PlaceMatching` scores, as `Address.text` would join them. */
const matchableFields = (row: PlaceRow): MatchableFields => ({
  name: row.name,
  addressText: Address.text(
    Address.of(
      {
        areaCode: AreaCode.create(row.area_code),
        prefecture: row.prefecture,
        municipality: row.municipality,
        town: row.town,
      },
      row.address_rest,
    ),
  ),
});

function compareCodePoints(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const diff =
      (left[i]?.codePointAt(0) ?? 0) - (right[i]?.codePointAt(0) ?? 0);
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

export const placeQueryHandlers: QueryHandlersOf<PlaceQueries> = {
  "place.findById": (sql, { id }) => {
    const row = sql
      .exec<PlaceRow>(`SELECT ${PLACE_COLUMNS} FROM places WHERE id = ?`, id)
      .toArray()[0];
    return row ? placeRowToRecord(row) : null;
  },
  "place.findByIds": (sql, { ids }) => readPlaceRecords(sql, ids),
  // Matching is the domain's function, not SQL: names and addresses are
  // compared after NFKC / case / whitespace normalization, which a LIKE
  // cannot express. Every candidate row is scored in the object.
  "place.match": (sql, { name, address, includeSuspended, page, limit }) => {
    const criteria = PlaceMatchCriteria.create({
      name,
      address,
      includeSuspended,
    });
    const rows = sql
      .exec<PlaceRow>(
        `SELECT ${PLACE_COLUMNS} FROM places
           ${includeSuspended ? "" : "WHERE suspended = 0"}`,
      )
      .toArray();
    const scored = rows
      .map((row) => ({ row, fields: matchableFields(row) }))
      .filter(({ row, fields }) =>
        PlaceMatching.matchesFields(
          fields,
          Number(row.suspended) === 1,
          criteria,
        ),
      )
      .map(({ row, fields }) => ({
        row,
        relevance: PlaceMatching.relevanceOf(fields, criteria),
      }))
      .sort(
        (a, b) =>
          b.relevance - a.relevance || compareCodePoints(a.row.id, b.row.id),
      );
    const start = (page - 1) * limit;
    return {
      items: scored
        .slice(start, start + limit)
        .map(({ row }) => placeRowToRecord(row)),
      count: scored.length,
    };
  },
};

/** `PlaceMatching.searchableText` of the stored place (`store/searchText.ts`). */
export const placeSearchText = (record: PlaceRecord) =>
  searchTextOf(() =>
    PlaceMatching.searchableText(
      Place.reconstruct({
        ...record,
        registeredAt: new Date(record.registeredAt),
        updatedAt: new Date(record.updatedAt),
      }),
    ),
  );

const indexPlace = (sql: SqlExec, record: PlaceRecord) => () =>
  putSearchText(sql, "place", record.id, placeSearchText(record));

export const placeCommandHandlers: CommandHandlersOf<PlaceCommand> = {
  "place.insert": (sql, { record }) =>
    afterApplied(
      insertUnique(
        sql,
        "places",
        { id: record.id, ...values(record) },
        `Place ${record.id}`,
      ),
      indexPlace(sql, record),
    ),
  "place.save": (sql, { record, expectedVersion }) =>
    afterApplied(
      updateVersioned(
        sql,
        "places",
        { id: record.id },
        values(record),
        expectedVersion,
        `Place ${record.id}`,
      ),
      indexPlace(sql, record),
    ),
};

/**
 * The `place` entry of `STEWARDED_TARGET_LOOKUPS`: stored places among
 * `ids` with their names, suspended ones included.
 */
export const placeStewardedTargetLookup: StewardedTargetLookup = (sql, ids) =>
  sql
    .exec<{ id: string; name: string } & SqlRow>(
      `SELECT id, name FROM places
         WHERE id IN (SELECT value FROM json_each(?))`,
      JSON.stringify(ids),
    )
    .toArray()
    .map((row) => ({ id: row.id, name: row.name }));

/**
 * The `place` entry of `CONTENT_LOOKUPS`: stored places among `ids` with
 * their names and current photos in order, suspended ones included.
 */
export const placeContentLookup: ContentLookup = (sql, ids) =>
  readPlaceRecords(sql, ids).map((record) => ({
    id: record.id,
    name: record.name,
    photoIds: record.photoIds,
  }));
