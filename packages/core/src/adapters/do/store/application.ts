import type {
  ApplicationCommand,
  ApplicationPage,
  ApplicationQueries,
  ApplicationRecord,
  ApplicationStatusRecord,
  OverdueNoticeRecord,
} from "../protocol/application";
import type { SqlExec, SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import { APPLIED, insertUnique, updateVersioned } from "./versioned";

const APPLICATION_TABLES_MIGRATION: Migration = {
  version: 6,
  name: "applications and overdue notices",
  statements: [
    // One row per application. `case_json` is the kind's snapshot of the
    // target and its fields; the object never reads it. The lookup columns
    // (applicant, slot, seat) are fixed by the target and written once.
    // `status_detail` holds the status fields other than `since` as JSON.
    `CREATE TABLE applications (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      applicant_kind TEXT NOT NULL,
      applicant_id TEXT NOT NULL,
      slot_key TEXT,
      seat_kind TEXT NOT NULL,
      seat_id TEXT,
      status TEXT NOT NULL,
      since INTEGER,
      status_detail TEXT NOT NULL,
      submitted_at INTEGER NOT NULL,
      case_json TEXT NOT NULL,
      version INTEGER NOT NULL
    )`,
    // One active application per slot (I-10). A closed application leaves
    // the index when its save commits, freeing the slot.
    `CREATE UNIQUE INDEX idx_applications_active_slot
       ON applications (slot_key)
       WHERE slot_key IS NOT NULL AND status IN ('underReview', 'returned')`,
    `CREATE INDEX idx_applications_applicant
       ON applications (applicant_kind, applicant_id, submitted_at)`,
    `CREATE INDEX idx_applications_awaiting
       ON applications (since, id)
       WHERE status = 'underReview'`,
    // Reverse index of `Application.subjects`, written on insert.
    `CREATE TABLE application_subjects (
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      PRIMARY KEY (subject_kind, subject_id, application_id)
    )`,
    `CREATE INDEX idx_application_subjects_application
       ON application_subjects (application_id)`,
    // One overdue-review notice record per application.
    `CREATE TABLE overdue_notices (
      application_id TEXT PRIMARY KEY,
      pending_since INTEGER NOT NULL
    )`,
  ],
};

/**
 * Application's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Application starts at 6; take the next free number
 * across all domains for any later migration.
 */
export const APPLICATION_MIGRATIONS: readonly Migration[] = [
  APPLICATION_TABLES_MIGRATION,
];

type ApplicationRow = Readonly<{
  id: string;
  kind: string;
  case_json: string;
  status: string;
  since: number | null;
  status_detail: string;
  submitted_at: number;
  version: number;
}> &
  SqlRow;

type StatusDetail = Readonly<{
  answering: Readonly<{ request: string; reply: string | null }> | null;
  request: string | null;
  reviewAs: string | null;
  reason: string | null;
  brokenPremises: readonly string[] | null;
}>;

type CountRow = Readonly<{ n: number }> & SqlRow;

const COLUMNS =
  "a.id, a.kind, a.case_json, a.status, a.since, a.status_detail, a.submitted_at, a.version";

const ACTIVE = "a.status IN ('underReview', 'returned')";

// A seat's region or occasion has a steward: Authority's stored
// stewardship of the seat target is `stewarded` (read-only here).
const SEAT_STEWARDED = `EXISTS (
  SELECT 1 FROM stewardships st
   WHERE st.target_kind = a.seat_kind
     AND st.target_id = a.seat_id
     AND st.status = 'stewarded')`;

function toRecord(row: ApplicationRow): ApplicationRecord {
  const detail = JSON.parse(row.status_detail) as StatusDetail;
  return {
    id: row.id,
    kind: row.kind,
    case: row.case_json,
    status: {
      kind: row.status,
      since: row.since === null ? null : new Date(Number(row.since)),
      answering: detail.answering,
      request: detail.request,
      reviewAs: detail.reviewAs,
      reason: detail.reason,
      brokenPremises: detail.brokenPremises,
    },
    submittedAt: new Date(Number(row.submitted_at)),
    version: Number(row.version),
  };
}

const statusDetail = (status: ApplicationStatusRecord): string =>
  JSON.stringify({
    answering: status.answering,
    request: status.request,
    reviewAs: status.reviewAs,
    reason: status.reason,
    brokenPremises: status.brokenPremises,
  } satisfies StatusDetail);

const mutableValues = (record: ApplicationRecord) => ({
  status: record.status.kind,
  since: record.status.since?.getTime() ?? null,
  status_detail: statusDetail(record.status),
  case_json: record.case,
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
): ApplicationPage {
  const items = sql
    .exec<ApplicationRow>(
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

const jsonOrNull = (values: readonly string[] | null): string | null =>
  values === null ? null : JSON.stringify(values);

const describeApplication = (id: string): string => `Application ${id}`;

export const applicationQueryHandlers: QueryHandlersOf<ApplicationQueries> = {
  "application.findById": (sql, { id }) => {
    const row = sql
      .exec<ApplicationRow>(
        `SELECT ${COLUMNS} FROM applications a WHERE a.id = ?`,
        id,
      )
      .toArray()[0];
    return row ? toRecord(row) : null;
  },
  "application.findByIds": (sql, { ids }) => {
    if (ids.length === 0) return [];
    return sql
      .exec<ApplicationRow>(
        `SELECT ${COLUMNS} FROM applications a
           WHERE a.id IN (SELECT value FROM json_each(?))`,
        JSON.stringify(ids),
      )
      .toArray()
      .map(toRecord);
  },
  "application.findActiveBySlot": (sql, { slotKey }) => {
    const row = sql
      .exec<ApplicationRow>(
        `SELECT ${COLUMNS} FROM applications a
           WHERE a.slot_key = ? AND ${ACTIVE}`,
        slotKey,
      )
      .toArray()[0];
    return row ? toRecord(row) : null;
  },
  "application.findActiveBySubject": (sql, { subject, page, limit }) =>
    pageOf(
      sql,
      `FROM application_subjects s
         JOIN applications a ON a.id = s.application_id
        WHERE s.subject_kind = ? AND s.subject_id = ? AND ${ACTIVE}`,
      [subject.kind, subject.id],
      "a.id",
      page,
      limit,
    ),
  "application.findActiveByIndividual": (sql, { accountId, page, limit }) =>
    pageOf(
      sql,
      `FROM applications a
        WHERE a.applicant_kind = 'individual' AND a.applicant_id = ?
          AND ${ACTIVE}`,
      [accountId],
      "a.id",
      page,
      limit,
    ),
  "application.findPageByApplicants": (
    sql,
    { individual, places, page, limit },
  ) => {
    if (individual === null && places.length === 0) {
      return { items: [], count: 0 };
    }
    return pageOf(
      sql,
      `FROM applications a
        WHERE (a.applicant_kind = 'individual' AND a.applicant_id = ?)
           OR (a.applicant_kind = 'place'
               AND a.applicant_id IN (SELECT value FROM json_each(?)))`,
      [individual, JSON.stringify(places)],
      "a.submitted_at DESC, a.id",
      page,
      limit,
    );
  },
  "application.findPageBySubject": (
    sql,
    { subject, kinds, statuses, applicant, page, limit },
  ) => {
    const kindsJson = jsonOrNull(kinds);
    const statusesJson = jsonOrNull(statuses);
    return pageOf(
      sql,
      `FROM application_subjects s
         JOIN applications a ON a.id = s.application_id
        WHERE s.subject_kind = ? AND s.subject_id = ?
          AND (? IS NULL OR a.kind IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR a.status IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR a.applicant_kind = ?)`,
      [
        subject.kind,
        subject.id,
        kindsJson,
        kindsJson,
        statusesJson,
        statusesJson,
        applicant,
        applicant,
      ],
      `CASE WHEN ${ACTIVE} THEN 0 ELSE 1 END, a.submitted_at DESC, a.id`,
      page,
      limit,
    );
  },
  "application.findPageAwaiting": (sql, { desk, page, limit }) =>
    desk.section === "asApprover"
      ? pageOf(
          sql,
          `FROM applications a
            WHERE a.status = 'underReview'
              AND (a.seat_kind = 'operator' OR NOT ${SEAT_STEWARDED})`,
          [],
          "a.since, a.id",
          page,
          limit,
        )
      : pageOf(
          sql,
          `FROM applications a
            WHERE a.status = 'underReview'
              AND a.seat_kind <> 'operator' AND ${SEAT_STEWARDED}
              AND a.since <= ?`,
          [desk.pendingSinceBefore.getTime()],
          "a.since, a.id",
          page,
          limit,
        ),
  "application.findOverdueNotices": (sql, { applicationIds }) => {
    if (applicationIds.length === 0) return [];
    return sql
      .exec<{ application_id: string; pending_since: number } & SqlRow>(
        `SELECT n.application_id, n.pending_since
           FROM overdue_notices n
           JOIN applications a ON a.id = n.application_id
          WHERE n.application_id IN (SELECT value FROM json_each(?))`,
        JSON.stringify(applicationIds),
      )
      .toArray()
      .map(
        (row): OverdueNoticeRecord => ({
          applicationId: row.application_id,
          pendingSince: new Date(Number(row.pending_since)),
        }),
      );
  },
};

export const applicationCommandHandlers: CommandHandlersOf<ApplicationCommand> =
  {
    "application.insert": (sql, { record, index }) => {
      const outcome = insertUnique(
        sql,
        "applications",
        {
          id: record.id,
          kind: record.kind,
          applicant_kind: index.applicant.kind,
          applicant_id: index.applicant.id,
          slot_key: index.slotKey,
          seat_kind: index.seat.kind,
          seat_id: index.seat.id,
          submitted_at: record.submittedAt.getTime(),
          ...mutableValues(record),
        },
        describeApplication(record.id),
      );
      if (outcome.kind !== "applied" || index.subjects.length === 0) {
        return outcome;
      }
      sql.exec(
        `INSERT OR IGNORE INTO application_subjects
           (subject_kind, subject_id, application_id)
         SELECT json_extract(value, '$.kind'), json_extract(value, '$.id'), ?
           FROM json_each(?)`,
        record.id,
        JSON.stringify(index.subjects.map(({ kind, id }) => ({ kind, id }))),
      );
      return outcome;
    },
    "application.save": (sql, { record, expectedVersion }) =>
      updateVersioned(
        sql,
        "applications",
        { id: record.id },
        mutableValues(record),
        expectedVersion,
        describeApplication(record.id),
      ),
    "application.recordOverdueNotice": (sql, { notice }) => {
      sql.exec(
        `INSERT INTO overdue_notices (application_id, pending_since)
           VALUES (?, ?)
           ON CONFLICT (application_id)
           DO UPDATE SET pending_since = excluded.pending_since`,
        notice.applicationId,
        notice.pendingSince.getTime(),
      );
      return APPLIED;
    },
  };
