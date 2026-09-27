import type { ApplicationId } from "@repo/core/domain/common/ids";

/**
 * The record that the overdue-review notice went out for an application
 * (期間超過の通知). `pendingSince` is the notified spell's `status.since`,
 * so a resubmission that restarts the spell is notified again. Kept outside
 * the aggregate (`OverdueNoticeLedger`).
 */
export type OverdueNotice = Readonly<{
  applicationId: ApplicationId;
  pendingSince: Date;
}>;
