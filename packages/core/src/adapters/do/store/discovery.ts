import type {
  DiscoveryCommand,
  DiscoveryQueries,
  ListingEntryRecord,
  PlaceEntryRecord,
  ReferenceResolutionRecord,
  RefRecord,
  SubstituteCoverRecord,
} from "../protocol/discovery";
import type { ListingRecord, OfferingRecord } from "../protocol/listing";
import type { SqlExec, SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import { LISTING_PHASE_SQL } from "./listing";
import { PLACE_COLUMNS, type PlaceRow, placeRowToRecord } from "./place";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/**
 * Discovery keeps no state of its own: every read is computed from Place's
 * and Listing's tables (`store/place.ts`, `store/listing.ts` document the
 * columns), so it has no migration. Migration 13 stays reserved for
 * Discovery should a read ever need an index.
 */
export const DISCOVERY_MIGRATIONS: readonly Migration[] = [];

/*
 * The SQL forms of `VisibilityPolicy` over `places p` and `listings l`
 * (`domain/discovery/visibilityPolicy.ts`). They compare stored flags only;
 * the conformance suites check them against the pure functions.
 */

/** `isPlaceViewable`: not suspended. */
const PLACE_VIEWABLE = "p.suspended = 0";

/** `isListingViewable`: published, not suspended, at a viewable place. */
const LISTING_VIEWABLE = `l.publication_status = 'published'
  AND l.suspended = 0 AND p.suspended = 0`;

/**
 * `admits("discovery", Standing.ofListing(…))`: available on the day bound
 * twice, at a place not permanently closed.
 */
const LISTING_DISCOVERABLE = `(${LISTING_PHASE_SQL}) = 'available'
  AND p.operating_status <> 'permanentlyClosed'`;

/** 「店舗の掲載の順」: available, upcoming, ended; newest first; id. Binds the day twice. */
const LISTINGS_OF_PLACE_ORDER = `CASE (${LISTING_PHASE_SQL})
    WHEN 'available' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END,
  l.first_published_at DESC, l.id`;

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

type CountRow = Readonly<{ n: number }> & SqlRow;
type PhotosRow = Readonly<{ id: string; photos: string }> & SqlRow;

const idsParam = (ids: readonly string[]): string => JSON.stringify(ids);

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
 * `ViewProjection.substituteCover` for a viewable place: the cover of its
 * newest viewable listing (any offering phase) when it has no photo.
 */
function substituteCoverOf(
  sql: SqlExec,
  place: PlaceRow,
): SubstituteCoverRecord | null {
  const own: unknown = JSON.parse(place.photo_ids);
  if (Array.isArray(own) && own.length > 0) return null;
  const newest = sql
    .exec<PhotosRow>(
      `SELECT l.id, l.photos FROM listings l JOIN places p ON p.id = l.place_id
         WHERE l.place_id = ? AND ${LISTING_VIEWABLE}
         ORDER BY l.first_published_at DESC, l.id LIMIT 1`,
      place.id,
    )
    .toArray()[0];
  if (newest === undefined) return null;
  const [photo] = JSON.parse(newest.photos) as readonly ListingPhotoRecord[];
  return photo === undefined ? null : { listingId: newest.id, photo };
}

/** Entries of the viewable places among `ids`, keyed by id. */
function placeEntries(
  sql: SqlExec,
  ids: readonly string[],
): ReadonlyMap<string, PlaceEntryRecord> {
  return new Map(
    viewablePlaceRows(sql, [...new Set(ids)]).map((row) => [
      row.id,
      {
        place: placeRowToRecord(row),
        substituteCover: substituteCoverOf(sql, row),
      },
    ]),
  );
}

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

/** The viewable listings among `ids`, keyed by id. */
function viewableListings(
  sql: SqlExec,
  ids: readonly string[],
): ReadonlyMap<string, ListingEntryRecord> {
  if (ids.length === 0) return new Map();
  const rows = sql
    .exec<ListingRow>(
      `SELECT ${LISTING_COLUMNS} FROM listings l
         JOIN places p ON p.id = l.place_id
         WHERE l.id IN (SELECT value FROM json_each(?)) AND ${LISTING_VIEWABLE}`,
      idsParam(ids),
    )
    .toArray();
  return new Map(
    listingEntries(sql, rows).map((entry) => [entry.listing.id, entry]),
  );
}

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
  return distinct.map((ref): ReferenceResolutionRecord => {
    const { kind, id } = ref;
    if (kind === "listing") {
      const entry = listings.get(id);
      if (entry !== undefined) {
        return { ref, viewable: true, target: { kind, entry } };
      }
    }
    if (kind === "place") {
      const entry = places.get(id);
      if (entry !== undefined) {
        return { ref, viewable: true, target: { kind, entry } };
      }
    }
    return { ref, viewable: false };
  });
}

function isViewable(sql: SqlExec, ref: RefRecord): boolean {
  switch (ref.kind) {
    case "place":
      return viewablePlaceRows(sql, [ref.id]).length > 0;
    case "listing": {
      const row = sql
        .exec<CountRow>(
          `SELECT COUNT(*) AS n FROM listings l
             JOIN places p ON p.id = l.place_id
             WHERE l.id = ? AND ${LISTING_VIEWABLE}`,
          ref.id,
        )
        .toArray()[0];
      return Number(row?.n ?? 0) > 0;
    }
    default:
      return false;
  }
}

export const discoveryQueryHandlers: QueryHandlersOf<DiscoveryQueries> = {
  "discovery.findListing": (sql, { listingId }) =>
    viewableListings(sql, [listingId]).get(listingId) ?? null,

  "discovery.findPlace": (sql, { placeId }) =>
    placeEntries(sql, [placeId]).get(placeId) ?? null,

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
        (page - 1) * limit,
      )
      .toArray();
    const count = sql
      .exec<CountRow>(
        `SELECT COUNT(*) AS n ${from}`,
        placeId,
        ...admittedBindings,
      )
      .toArray()[0];
    return {
      items: rows.map((row) => ({ listing: listingRowToRecord(row), place })),
      count: Number(count?.n ?? 0),
    };
  },

  "discovery.resolve": (sql, { refs }) => resolve(sql, refs),

  "discovery.isViewable": (sql, { ref }) => isViewable(sql, ref),
};

export const discoveryCommandHandlers: CommandHandlersOf<DiscoveryCommand> = {};
