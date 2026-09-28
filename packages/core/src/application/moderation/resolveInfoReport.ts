import type { InfoReportId } from "@repo/core/domain/common/ids";
import { InfoReport } from "@repo/core/domain/moderation/infoReport";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireInfoReport } from "./reads";
import { type InfoReportView, infoReportView } from "./views";

export type ResolveInfoReportInput = Readonly<{ reportId: InfoReportId }>;

/**
 * An operator closes an open or confirmation-requested report, keeping its
 * request (`spec/usecases/moderation.md` 「resolveInfoReport」; MOD-05 /
 * OM-05). No outcome, no event, nobody notified; stewards, viewability and
 * the listing's existence are not checked.
 *
 * - `ForbiddenError` (`operate_service`, also when revoked before the
 *   commit); `NotFoundError` (`INFO_REPORT_NOT_FOUND`).
 * - `BusinessRuleError` `MODERATION_INFO_REPORT_ALREADY_RESOLVED`.
 * - `ConflictError` when a concurrent request or resolve commits first.
 */
export async function resolveInfoReport({
  container,
  actor,
  input,
}: ActorServiceArgs<ResolveInfoReportInput>): Promise<InfoReportView> {
  const resolved = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const found = await requireInfoReport(ctx, input.reportId);
    const entity = InfoReport.resolve(found.entity);
    await ctx.infoReportRepository.save(entity, found.expectedVersion);
    return entity;
  });
  return infoReportView(resolved);
}
