import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { AccountId, InfoReportId } from "@repo/core/domain/common/ids";
import { Pagination } from "@repo/core/domain/common/pagination";
import type {
  ConfirmationRequestedInfoReport,
  OpenInfoReport,
} from "@repo/core/domain/moderation/infoReport";
import type { InfoReportCategory } from "@repo/core/domain/moderation/values";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { describeTargets, readAccounts } from "./reads";
import {
  type InfoReportTargetView,
  infoReportRefs,
  infoReportTargetView,
} from "./views";

export type ListUnresolvedInfoReportsInput = Readonly<{
  pagination: Pagination;
}>;

export type UnresolvedInfoReportRow = Readonly<{
  reportId: InfoReportId;
  target: InfoReportTargetView;
  category: InfoReportCategory;
  status: (OpenInfoReport | ConfirmationRequestedInfoReport)["status"];
  reporter: AccountId;
  /** `null` once the reporter withdrew. */
  reporterEmail: EmailAddress | null;
  receivedAt: Date;
}>;

export type ListUnresolvedInfoReportsOutput = Readonly<{
  items: readonly UnresolvedInfoReportRow[];
  /** Every open and confirmation-requested report. */
  count: number;
}>;

/**
 * The open and confirmation-requested info reports, received oldest first
 * whatever their status (`spec/usecases/moderation.md`
 * 「listUnresolvedInfoReports」; OPE-01 / OM-01). Reports of withdrawn
 * reporters and deleted listings are included, without the email or the
 * listing's name.
 *
 * - `ForbiddenError` without `operate_service`.
 * - `BusinessRuleError` `COMMON_INVALID_INPUT` for an invalid pagination.
 */
export async function listUnresolvedInfoReports({
  container,
  actor,
  input,
}: ActorServiceArgs<ListUnresolvedInfoReportsInput>): Promise<ListUnresolvedInfoReportsOutput> {
  const pagination = Pagination.create(input.pagination);
  const { page, accounts } = await container.unitOfWorkProvider.run(
    async (ctx) => {
      await authorizeRole(ctx, actor, "operate_service");
      const found = await ctx.infoReportRepository.findUnresolved(pagination);
      return {
        page: found,
        accounts: await readAccounts(
          ctx,
          found.items.map((report) => report.reporter),
        ),
      };
    },
  );
  const described = await describeTargets(
    container.contentDirectory,
    infoReportRefs(page.items.map((report) => report.target)),
  );
  return {
    items: page.items.map((report) => ({
      reportId: report.id,
      target: infoReportTargetView(report.target, described),
      category: report.category,
      status: report.status,
      reporter: report.reporter,
      reporterEmail: accounts.get(report.reporter)?.email ?? null,
      receivedAt: report.receivedAt,
    })),
    count: page.count,
  };
}
