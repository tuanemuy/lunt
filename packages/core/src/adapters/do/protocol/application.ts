import type { QuerySpec } from "./queries";

/** A stored status; every field not of its kind is `null`. */
export type ApplicationStatusRecord = Readonly<{
  kind: string;
  since: Date | null;
  answering: Readonly<{ request: string; reply: string | null }> | null;
  request: string | null;
  reviewAs: string | null;
  reason: string | null;
  brokenPremises: readonly string[] | null;
}>;

/**
 * At-rest shape of an application. `case` is the kind definition's
 * snapshot of the target and the kind's fields, as JSON text — the object
 * stores it without reading it.
 */
export type ApplicationRecord = Readonly<{
  id: string;
  kind: string;
  case: string;
  status: ApplicationStatusRecord;
  submittedAt: Date;
  version: number;
}>;

export type RefRecord = Readonly<{ kind: string; id: string }>;

/**
 * The application's lookup keys, fixed by its target and computed by the
 * domain on the request side (`Application.slotOf` / `subjects` /
 * `approverSeat`). Kinds are registered per stage in request-side code,
 * so the object indexes what it is given instead of deriving it.
 */
export type ApplicationIndexRecord = Readonly<{
  applicant: RefRecord;
  /** `ApplicationSlot.key`; `null` for a kind without a slot. */
  slotKey: string | null;
  /** `operator` (id `null`), `region` or `occasion`. */
  seat: Readonly<{ kind: string; id: string | null }>;
  subjects: readonly RefRecord[];
}>;

export type ApplicationPage = Readonly<{
  items: readonly ApplicationRecord[];
  count: number;
}>;

export type OverdueNoticeRecord = Readonly<{
  applicationId: string;
  pendingSince: Date;
}>;

type Paged = Readonly<{ page: number; limit: number }>;

export type ReviewDeskRecord =
  | Readonly<{ section: "asApprover" }>
  | Readonly<{ section: "asOverdueProxy"; pendingSinceBefore: Date }>;

/**
 * Application's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/application.ts` must cover every one.
 */
export type ApplicationQueries = {
  "application.findById": QuerySpec<{ id: string }, ApplicationRecord | null>;
  /** Any status; `ids` at most 100. */
  "application.findByIds": QuerySpec<
    { ids: readonly string[] },
    readonly ApplicationRecord[]
  >;
  "application.findActiveBySlot": QuerySpec<
    { slotKey: string },
    ApplicationRecord | null
  >;
  "application.findActiveBySubject": QuerySpec<
    Paged & { subject: RefRecord },
    ApplicationPage
  >;
  "application.findActiveByIndividual": QuerySpec<
    Paged & { accountId: string },
    ApplicationPage
  >;
  "application.findPageByApplicants": QuerySpec<
    Paged & { individual: string | null; places: readonly string[] },
    ApplicationPage
  >;
  /** `null` filter items do not filter. */
  "application.findPageBySubject": QuerySpec<
    Paged & {
      subject: RefRecord;
      kinds: readonly string[] | null;
      statuses: readonly string[] | null;
      applicant: string | null;
    },
    ApplicationPage
  >;
  "application.findPageAwaiting": QuerySpec<
    Paged & { desk: ReviewDeskRecord },
    ApplicationPage
  >;
  /** Records of existing applications among `applicationIds` (at most 100). */
  "application.findOverdueNotices": QuerySpec<
    { applicationIds: readonly string[] },
    readonly OverdueNoticeRecord[]
  >;
};

export type ApplicationCommand =
  | Readonly<{
      kind: "application.insert";
      record: ApplicationRecord;
      index: ApplicationIndexRecord;
    }>
  | Readonly<{
      kind: "application.save";
      record: ApplicationRecord;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "application.recordOverdueNotice";
      notice: OverdueNoticeRecord;
    }>;
