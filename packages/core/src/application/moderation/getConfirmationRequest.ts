import type { InfoReportId } from "@repo/core/domain/common/ids";
import { InfoReport } from "@repo/core/domain/moderation/infoReport";
import type {
  InfoReportCategory,
  InfoReportContent,
} from "@repo/core/domain/moderation/values";
import { authorizeOnTarget } from "../authority/access";
import { NotFoundError } from "../errors";
import type { ActorServiceArgs } from "../types";
import {
  describeTargets,
  INFO_REPORT_NOT_FOUND,
  requireInfoReport,
} from "./reads";
import {
  type InfoReportTargetView,
  infoReportRefs,
  infoReportTargetView,
} from "./views";

export type GetConfirmationRequestInput = Readonly<{ reportId: InfoReportId }>;

export type ConfirmationRequestDetail = Readonly<{
  reportId: InfoReportId;
  /** `exists` is `false` for a deleted listing. */
  target: InfoReportTargetView;
  category: InfoReportCategory;
  content: InfoReportContent;
  requestedAt: Date;
  /** Still awaiting the operators, or closed by them. */
  status: "confirmationRequested" | "resolved";
}>;

/**
 * A steward of the report's place reads one confirmation request, still
 * open or already resolved (`spec/usecases/moderation.md`
 * 「getConfirmationRequest」; MOD-06 / SM-07). A report never asked about
 * reads as missing. Read-only for stewards.
 *
 * Checked in order: `NotFoundError` (`INFO_REPORT_NOT_FOUND`, no report);
 * `ForbiddenError` without `act_as_place` on `target.placeId` (operators
 * included); `NotFoundError` (`INFO_REPORT_NOT_FOUND`) when the report has
 * no request.
 */
export async function getConfirmationRequest({
  container,
  actor,
  input,
}: ActorServiceArgs<GetConfirmationRequestInput>): Promise<ConfirmationRequestDetail> {
  const report = await container.unitOfWorkProvider.run(async (ctx) => {
    const found = (await requireInfoReport(ctx, input.reportId)).entity;
    await authorizeOnTarget(ctx, actor, "act_as_place", {
      kind: "place",
      id: found.target.placeId,
    });
    return found;
  });
  const request = InfoReport.confirmationRequestOf(report);
  if (request === null || report.status === "open") {
    throw new NotFoundError(
      INFO_REPORT_NOT_FOUND,
      "The info report has no confirmation request",
    );
  }
  const described = await describeTargets(
    container.contentDirectory,
    infoReportRefs([report.target]),
  );
  return {
    reportId: report.id,
    target: infoReportTargetView(report.target, described),
    category: report.category,
    content: report.content,
    requestedAt: request.requestedAt,
    status: report.status,
  };
}
