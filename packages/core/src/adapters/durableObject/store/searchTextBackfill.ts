import type { OccasionRecord } from "../protocol/occasion";
import type { PlaceRecord } from "../protocol/place";
import type { RegionRecord } from "../protocol/region";
import type { SqlExec, SqlRow } from "../sql";
import { articleSearchText } from "./article";
import { listingSearchText } from "./listing";
import { occasionSearchText } from "./occasion";
import { placeSearchText } from "./place";
import { regionSearchText } from "./region";
import { putSearchText, type SearchTargetKind } from "./searchText";

/**
 * Migration 21's backfill of `search_texts`, frozen at schema version 21.
 *
 * Migrations run in version order, so an object migrating from before 21
 * (an empty one included) runs this against the tables exactly as they
 * are at version 21, whatever later migrations add. It therefore reads
 * only the columns below — every one exists at version 21 — and maps rows
 * with its own copies of the version-21 row readers, never the stores'
 * current `*_COLUMNS` / `*RowToRecord`. The text itself comes from the
 * same record → text functions the stores' writes use, so a backfilled
 * text equals the one a fresh write stores (and a target whose text
 * cannot be built gets no row). If a record type later gains a field,
 * give it here the value the migration that adds its column gives the
 * rows that already exist.
 */
export const SEARCH_TEXT_BACKFILL_COLUMNS = {
  places: `id, name, photo_ids, photos_taken_down, description, area_code,
    prefecture, municipality, town, address_rest, latitude, longitude,
    business_hours, contact, operating_status, suspended, registered_at,
    updated_at, version`,
  listings: "id, name, description",
  regions: `id, publication_status, first_published_at, unpublish_reason,
    suspended, name, area_code, prefecture, municipality, town, address_rest,
    latitude, longitude, photo_ids, photos_taken_down, description, tagline,
    updated_at, version`,
  occasions: `id, publication_status, first_published_at, unpublish_reason,
    suspended, cancelled, name, period_start, period_end, area_code,
    prefecture, municipality, town, address_rest, latitude, longitude,
    photo_ids, photos_taken_down, description, tagline, updated_at, version`,
  articles: "id, title, body",
} as const;

export type SearchTextBackfillTable = keyof typeof SEARCH_TEXT_BACKFILL_COLUMNS;

const PAGE = 200;

/**
 * Visits `table`'s rows in id order, `PAGE` at a time, so the backfill
 * never holds every (long) row at once.
 */
function eachRow<R extends SqlRow & Readonly<{ id: string }>>(
  sql: SqlExec,
  table: SearchTextBackfillTable,
  visit: (row: R) => void,
): void {
  let after = "";
  for (;;) {
    const rows = sql
      .exec<R>(
        `SELECT ${SEARCH_TEXT_BACKFILL_COLUMNS[table]} FROM ${table}
          WHERE id > ? ORDER BY id LIMIT ?`,
        after,
        PAGE,
      )
      .toArray();
    for (const row of rows) visit(row);
    const last = rows[rows.length - 1];
    if (last === undefined || rows.length < PAGE) return;
    after = last.id;
  }
}

/**
 * A stored JSON array of ids, or the text itself when it is not JSON: the
 * domain's rehydration refuses anything else, which leaves the target
 * without a text instead of failing the migration.
 */
const storedIds = (raw: string): readonly string[] => {
  try {
    return JSON.parse(raw) as readonly string[];
  } catch {
    return raw as unknown as readonly string[];
  }
};

type Address = Readonly<{
  area_code: string | null;
  prefecture: string | null;
  municipality: string | null;
  town: string | null;
  address_rest: string | null;
}>;

type PlaceRow21 = Readonly<{
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

const placeRecord = (row: PlaceRow21): PlaceRecord => ({
  id: row.id,
  name: row.name,
  photoIds: storedIds(row.photo_ids),
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

type ListingRow21 = Readonly<{
  id: string;
  name: string | null;
  description: string | null;
}> &
  SqlRow;

type RegionRow21 = Readonly<{
  id: string;
  publication_status: string;
  first_published_at: number | null;
  unpublish_reason: string | null;
  suspended: number;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  photo_ids: string;
  photos_taken_down: number;
  description: string | null;
  tagline: string | null;
  updated_at: number;
  version: number;
}> &
  Address &
  SqlRow;

const regionRecord = (row: RegionRow21): RegionRecord => ({
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
    address:
      row.area_code === null ||
      row.prefecture === null ||
      row.municipality === null ||
      row.town === null ||
      row.address_rest === null
        ? null
        : {
            areaCode: row.area_code,
            prefecture: row.prefecture,
            municipality: row.municipality,
            town: row.town,
            rest: row.address_rest,
          },
    location:
      row.latitude === null || row.longitude === null
        ? null
        : { latitude: Number(row.latitude), longitude: Number(row.longitude) },
    photoIds: storedIds(row.photo_ids),
    photosTakenDown: Number(row.photos_taken_down) === 1,
    description: row.description,
    tagline: row.tagline,
  },
  updatedAt: Number(row.updated_at),
  version: Number(row.version),
});

type OccasionRow21 = Readonly<{
  id: string;
  publication_status: string;
  first_published_at: number | null;
  unpublish_reason: string | null;
  suspended: number;
  cancelled: number;
  name: string | null;
  period_start: string | null;
  period_end: string | null;
  latitude: number | null;
  longitude: number | null;
  photo_ids: string;
  photos_taken_down: number;
  description: string | null;
  tagline: string | null;
  updated_at: number;
  version: number;
}> &
  Address &
  SqlRow;

const occasionRecord = (row: OccasionRow21): OccasionRecord => ({
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
    photoIds: storedIds(row.photo_ids),
    photosTakenDown: Number(row.photos_taken_down) === 1,
    description: row.description,
    tagline: row.tagline,
  },
  updatedAt: new Date(Number(row.updated_at)),
  version: Number(row.version),
});

type ArticleRow21 = Readonly<{
  id: string;
  title: string | null;
  body: string | null;
}> &
  SqlRow;

/** Migration 21's `run`: every stored target's search text (see above). */
export function backfillSearchTexts(sql: SqlExec): void {
  const put = (kind: SearchTargetKind) => (id: string, text: Text) =>
    putSearchText(sql, kind, id, text);
  eachRow<PlaceRow21>(sql, "places", (row) =>
    put("place")(row.id, placeSearchText(placeRecord(row))),
  );
  eachRow<ListingRow21>(sql, "listings", (row) =>
    put("listing")(row.id, listingSearchText(row.name, row.description)),
  );
  eachRow<RegionRow21>(sql, "regions", (row) =>
    put("region")(row.id, regionSearchText(regionRecord(row))),
  );
  eachRow<OccasionRow21>(sql, "occasions", (row) =>
    put("occasion")(row.id, occasionSearchText(occasionRecord(row))),
  );
  eachRow<ArticleRow21>(sql, "articles", (row) =>
    put("article")(row.id, articleSearchText(row)),
  );
}

type Text = Parameters<typeof putSearchText>[3];
