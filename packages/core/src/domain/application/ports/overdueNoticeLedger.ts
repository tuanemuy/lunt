import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { OverdueNotice } from "../overdueNotice";

/**
 * The overdue-review notice records, one per application, kept apart from
 * the aggregate (`spec/domains/application.md` 「OverdueNoticeLedger」).
 * Inside a unit of work as `overdueNoticeLedger`.
 *
 * - `findByApplicationIds`: the records of 0–100 ids
 *   (`COMMON_INVALID_INPUT` above), in no particular order; an id without
 *   a record — or whose application does not exist — is absent.
 * - `record`: replaces the application's record or creates it. No
 *   optimistic lock, and it never advances the application's version; it
 *   commits with the scope's events. It does not check the application
 *   exists.
 *
 * It never reads the application's status or the stewardships: which
 * applications are due is the review desk's `asOverdueProxy`.
 */
export interface OverdueNoticeLedger {
  findByApplicationIds(
    ids: readonly ApplicationId[],
  ): Promise<readonly OverdueNotice[]>;
  record(notice: OverdueNotice): Promise<void>;
}
