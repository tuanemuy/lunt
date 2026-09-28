import type { QuerySpec } from "./queries";

/** A `ContentRef` on the wire. */
export type ContentRefRecord = Readonly<{ kind: string; id: string }>;

export type ContentSummaryRecord = Readonly<{
  target: ContentRefRecord;
  name: string | null;
  photoIds: readonly string[];
}>;

/**
 * At-rest shape of a takedown claim (`TakedownClaim.snapshot` with times as
 * epoch milliseconds). Values pass through the store unchecked; the request
 * side's `TakedownClaim.reconstruct` rejects invalid ones.
 */
export type TakedownClaimRecord = Readonly<{
  id: string;
  standing: string;
  target: ContentRefRecord;
  photoIds: readonly string[];
  reason: string;
  email: string;
  receivedAt: number;
  status: string;
  outcome: string | null;
  version: number;
}>;

/** At-rest shape of an info report (`InfoReport.snapshot`, epoch ms). */
export type InfoReportRecord = Readonly<{
  id: string;
  target: Readonly<{
    kind: string;
    placeId: string;
    listingId: string | null;
  }>;
  category: string;
  content: string;
  reporter: string;
  receivedAt: number;
  status: string;
  requestedAt: number | null;
  version: number;
}>;

type Page<T> = Readonly<{ items: readonly T[]; count: number }>;

/**
 * Moderation's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/moderation.ts` must cover every one.
 */
export type ModerationQueries = {
  /** Existing targets among `targets` (at most 100), in `ContentOrder`. */
  "moderation.describeContent": QuerySpec<
    { targets: readonly ContentRefRecord[] },
    readonly ContentSummaryRecord[]
  >;
  "moderation.findTakedownClaim": QuerySpec<
    { id: string },
    TakedownClaimRecord | null
  >;
  /** Open claims by `receivedAt`, then id. */
  "moderation.findOpenTakedownClaims": QuerySpec<
    { page: number; limit: number },
    Page<TakedownClaimRecord>
  >;
  "moderation.findInfoReport": QuerySpec<
    { id: string },
    InfoReportRecord | null
  >;
  /** Open and confirmation-requested reports by `receivedAt`, then id. */
  "moderation.findUnresolvedInfoReports": QuerySpec<
    { page: number; limit: number },
    Page<InfoReportRecord>
  >;
  /** Confirmation-requested reports of `placeId` by `requestedAt` desc, then id. */
  "moderation.findConfirmationRequestedInfoReports": QuerySpec<
    { placeId: string; page: number; limit: number },
    Page<InfoReportRecord>
  >;
};

export type ModerationCommand =
  | Readonly<{
      kind: "moderation.insertTakedownClaim";
      record: TakedownClaimRecord;
    }>
  | Readonly<{
      kind: "moderation.saveTakedownClaim";
      record: TakedownClaimRecord;
      expectedVersion: number;
    }>
  | Readonly<{ kind: "moderation.insertInfoReport"; record: InfoReportRecord }>
  | Readonly<{
      kind: "moderation.saveInfoReport";
      record: InfoReportRecord;
      expectedVersion: number;
    }>;
