import type { Pagination } from "@repo/core/domain/common/pagination";
import type { ScanResult } from "@repo/core/domain/common/scan";
import type { ApplicationIn, KindMap } from "../kind";
import type { ApplicationKindMap } from "../kinds";
import type { UnderReview } from "../status";

/**
 * The operators' two sections of applications awaiting them. Both are seen
 * by an operator who is not a steward of the seat's region or occasion.
 *
 * - `asApprover`: under review with an operator seat (a stewardship claim
 *   whose registration is undecided included), or with a region / occasion
 *   seat that has no steward (no stored stewardship, or `vacant`).
 * - `asOverdueProxy`: under review with a region / occasion seat that has
 *   a steward, and `status.since` at or before `pendingSinceBefore` — the
 *   usecase passes `ReviewPolicy.overdueCutoff(policy, now)`.
 */
export type ReviewDesk =
  | Readonly<{ section: "asApprover" }>
  | Readonly<{ section: "asOverdueProxy"; pendingSinceBefore: Date }>;

/**
 * Applications awaiting the operators (`spec/domains/application.md`
 * 「ApplicationReviewDesk」): a read across applications and Authority's
 * stewardships. Read-only, outside any unit of work (container member).
 * Oldest `status.since` first, then id; returned and closed applications
 * never appear; `count` is the section's total. The sections never
 * overlap. Committed writes of applications and stewardships show at once.
 * A row that cannot be restored is reported in `unreadable` by application
 * id, so one unreadable application does not stop the daily job.
 */
export interface ApplicationReviewDesk<M extends KindMap = ApplicationKindMap> {
  findPageAwaiting(
    desk: ReviewDesk,
    pagination: Pagination,
  ): Promise<ScanResult<UnderReview<ApplicationIn<M>>>>;
}
