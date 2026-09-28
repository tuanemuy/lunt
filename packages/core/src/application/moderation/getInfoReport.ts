import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { InfoReportId } from "@repo/core/domain/common/ids";
import { InfoReportTarget } from "@repo/core/domain/moderation/values";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import {
  describeTargets,
  placeHasSteward,
  readAccounts,
  requireInfoReport,
} from "./reads";
import {
  type InfoReportTargetView,
  type InfoReportView,
  infoReportRefs,
  infoReportTargetView,
  infoReportView,
} from "./views";

export type GetInfoReportInput = Readonly<{ reportId: InfoReportId }>;

export type InfoReportDetail = Omit<InfoReportView, "target"> &
  Readonly<{
    target: InfoReportTargetView;
    /** Viewers can see the reported target (`ReferenceQueries.isViewable`). */
    targetViewable: boolean;
    /** `null` once the reporter withdrew. */
    reporterEmail: EmailAddress | null;
    /** The target's place has a steward now. */
    placeHasSteward: boolean;
  }>;

/**
 * One info report in any status, with its target's names and current
 * state, the reporter's email and whether the place has a steward now
 * (`spec/usecases/moderation.md` 「getInfoReport」; MOD-05 / OM-05). A
 * deleted listing or an unviewable target is reported in the output, not
 * as an error.
 *
 * - `ForbiddenError` without `operate_service`; `NotFoundError`
 *   (`INFO_REPORT_NOT_FOUND`).
 */
export async function getInfoReport({
  container,
  actor,
  input,
}: ActorServiceArgs<GetInfoReportInput>): Promise<InfoReportDetail> {
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const report = (await requireInfoReport(ctx, input.reportId)).entity;
    const [accounts, hasSteward] = await Promise.all([
      readAccounts(ctx, [report.reporter]),
      placeHasSteward(ctx, report.target.placeId),
    ]);
    return {
      report,
      email: accounts.get(report.reporter)?.email ?? null,
      hasSteward,
    };
  });
  const { report } = read;
  const [described, viewable] = await Promise.all([
    describeTargets(
      container.contentDirectory,
      infoReportRefs([report.target]),
    ),
    container.referenceQueries.isViewable(
      InfoReportTarget.contentRef(report.target),
    ),
  ]);
  return {
    ...infoReportView(report),
    target: infoReportTargetView(report.target, described),
    targetViewable: viewable,
    reporterEmail: read.email,
    placeHasSteward: read.hasSteward,
  };
}
