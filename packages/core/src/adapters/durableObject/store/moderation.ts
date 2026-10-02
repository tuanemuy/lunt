import type {
  InfoReportRecord,
  ModerationCommand,
  ModerationQueries,
  TakedownClaimRecord,
} from "../protocol/moderation";
import type { SqlExec, SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import { CONTENT_LOOKUPS, describeContent } from "./contentLookups";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import { insertUnique, updateVersioned } from "./versioned";

/**
 * `takedown_claims`: one row per claim, written only from the aggregate
 * snapshot. `photo_ids` is the claimant's photos as a JSON array (empty for
 * a proprietor); `outcome` is `NULL` while open.
 *
 * `info_reports`: one row per report. `place_id` is the target's place (a
 * listing target's too), `listing_id` is `NULL` for a place target;
 * `requested_at` is `NULL` until a confirmation request.
 *
 * Times are epoch ms; `version` is the optimistic-lock version. Neither
 * table is ever deleted from.
 */
const MODERATION_TABLES_MIGRATION: Migration = {
  version: 14,
  name: "takedown claims and info reports",
  statements: [
    `CREATE TABLE takedown_claims (
      id TEXT PRIMARY KEY,
      standing TEXT NOT NULL,
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      photo_ids TEXT NOT NULL,
      reason TEXT NOT NULL,
      email TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      outcome TEXT,
      version INTEGER NOT NULL
    )`,
    `CREATE INDEX idx_takedown_claims_status_received
       ON takedown_claims (status, received_at, id)`,
    `CREATE TABLE info_reports (
      id TEXT PRIMARY KEY,
      target_kind TEXT NOT NULL,
      place_id TEXT NOT NULL,
      listing_id TEXT,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      reporter TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      requested_at INTEGER,
      version INTEGER NOT NULL
    )`,
    `CREATE INDEX idx_info_reports_status_received
       ON info_reports (status, received_at, id)`,
    `CREATE INDEX idx_info_reports_place_requested
       ON info_reports (place_id, status, requested_at DESC, id)`,
  ],
};

/** Moderation's tables (migration 14). */
export const MODERATION_MIGRATIONS: readonly Migration[] = [
  MODERATION_TABLES_MIGRATION,
];

type TakedownClaimRow = Readonly<{
  id: string;
  standing: string;
  target_kind: string;
  target_id: string;
  photo_ids: string;
  reason: string;
  email: string;
  received_at: number;
  status: string;
  outcome: string | null;
  version: number;
}> &
  SqlRow;

type InfoReportRow = Readonly<{
  id: string;
  target_kind: string;
  place_id: string;
  listing_id: string | null;
  category: string;
  content: string;
  reporter: string;
  received_at: number;
  status: string;
  requested_at: number | null;
  version: number;
}> &
  SqlRow;

const CLAIM_COLUMNS =
  "id, standing, target_kind, target_id, photo_ids, reason, email, received_at, status, outcome, version";

const REPORT_COLUMNS =
  "id, target_kind, place_id, listing_id, category, content, reporter, received_at, status, requested_at, version";

const claimRecord = (row: TakedownClaimRow): TakedownClaimRecord => ({
  id: row.id,
  standing: row.standing,
  target: { kind: row.target_kind, id: row.target_id },
  photoIds: JSON.parse(row.photo_ids) as string[],
  reason: row.reason,
  email: row.email,
  receivedAt: Number(row.received_at),
  status: row.status,
  outcome: row.outcome,
  version: Number(row.version),
});

const claimValues = (record: TakedownClaimRecord) => ({
  standing: record.standing,
  target_kind: record.target.kind,
  target_id: record.target.id,
  photo_ids: JSON.stringify(record.photoIds),
  reason: record.reason,
  email: record.email,
  received_at: record.receivedAt,
  status: record.status,
  outcome: record.outcome,
  version: record.version,
});

const reportRecord = (row: InfoReportRow): InfoReportRecord => ({
  id: row.id,
  target: {
    kind: row.target_kind,
    placeId: row.place_id,
    listingId: row.listing_id,
  },
  category: row.category,
  content: row.content,
  reporter: row.reporter,
  receivedAt: Number(row.received_at),
  status: row.status,
  requestedAt: row.requested_at === null ? null : Number(row.requested_at),
  version: Number(row.version),
});

const reportValues = (record: InfoReportRecord) => ({
  target_kind: record.target.kind,
  place_id: record.target.placeId,
  listing_id: record.target.listingId,
  category: record.category,
  content: record.content,
  reporter: record.reporter,
  received_at: record.receivedAt,
  status: record.status,
  requested_at: record.requestedAt,
  version: record.version,
});

/** One page of `from … where` plus its total; `order` breaks every tie. */
function pageOf<R extends SqlRow, T>(
  sql: SqlExec,
  query: Readonly<{
    columns: string;
    from: string;
    where: string;
    order: string;
    bindings: readonly unknown[];
  }>,
  page: Readonly<{ page: number; limit: number }>,
  toRecord: (row: R) => T,
): Readonly<{ items: readonly T[]; count: number }> {
  const items = sql
    .exec<R>(
      `SELECT ${query.columns} FROM ${query.from}
         WHERE ${query.where}
         ORDER BY ${query.order}
         LIMIT ? OFFSET ?`,
      ...query.bindings,
      page.limit,
      (page.page - 1) * page.limit,
    )
    .toArray()
    .map(toRecord);
  const total = sql
    .exec<{ n: number } & SqlRow>(
      `SELECT COUNT(*) AS n FROM ${query.from} WHERE ${query.where}`,
      ...query.bindings,
    )
    .toArray()[0];
  return { items, count: Number(total?.n ?? 0) };
}

export const moderationQueryHandlers: QueryHandlersOf<ModerationQueries> = {
  "moderation.describeContent": (sql, { targets }) =>
    describeContent(sql, targets, CONTENT_LOOKUPS),
  "moderation.findTakedownClaim": (sql, { id }) => {
    const row = sql
      .exec<TakedownClaimRow>(
        `SELECT ${CLAIM_COLUMNS} FROM takedown_claims WHERE id = ?`,
        id,
      )
      .toArray()[0];
    return row === undefined ? null : claimRecord(row);
  },
  "moderation.findOpenTakedownClaims": (sql, page) =>
    pageOf(
      sql,
      {
        columns: CLAIM_COLUMNS,
        from: "takedown_claims",
        where: "status = 'open'",
        order: "received_at, id",
        bindings: [],
      },
      page,
      claimRecord,
    ),
  "moderation.findInfoReport": (sql, { id }) => {
    const row = sql
      .exec<InfoReportRow>(
        `SELECT ${REPORT_COLUMNS} FROM info_reports WHERE id = ?`,
        id,
      )
      .toArray()[0];
    return row === undefined ? null : reportRecord(row);
  },
  "moderation.findUnresolvedInfoReports": (sql, page) =>
    pageOf(
      sql,
      {
        columns: REPORT_COLUMNS,
        from: "info_reports",
        where: "status IN ('open', 'confirmationRequested')",
        order: "received_at, id",
        bindings: [],
      },
      page,
      reportRecord,
    ),
  "moderation.findConfirmationRequestedInfoReports": (
    sql,
    { placeId, page, limit },
  ) =>
    pageOf(
      sql,
      {
        columns: REPORT_COLUMNS,
        from: "info_reports",
        where: "place_id = ? AND status = 'confirmationRequested'",
        order: "requested_at DESC, id",
        bindings: [placeId],
      },
      { page, limit },
      reportRecord,
    ),
};

export const moderationCommandHandlers: CommandHandlersOf<ModerationCommand> = {
  "moderation.insertTakedownClaim": (sql, { record }) =>
    insertUnique(
      sql,
      "takedown_claims",
      { id: record.id, ...claimValues(record) },
      `Takedown claim ${record.id}`,
    ),
  "moderation.saveTakedownClaim": (sql, { record, expectedVersion }) =>
    updateVersioned(
      sql,
      "takedown_claims",
      { id: record.id },
      claimValues(record),
      expectedVersion,
      `Takedown claim ${record.id}`,
    ),
  "moderation.insertInfoReport": (sql, { record }) =>
    insertUnique(
      sql,
      "info_reports",
      { id: record.id, ...reportValues(record) },
      `Info report ${record.id}`,
    ),
  "moderation.saveInfoReport": (sql, { record, expectedVersion }) =>
    updateVersioned(
      sql,
      "info_reports",
      { id: record.id },
      reportValues(record),
      expectedVersion,
      `Info report ${record.id}`,
    ),
};
