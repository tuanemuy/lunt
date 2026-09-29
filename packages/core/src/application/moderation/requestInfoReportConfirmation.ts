import type { InfoReportId } from "@repo/core/domain/common/ids";
import { InfoReport } from "@repo/core/domain/moderation/infoReport";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { placeHasSteward, requireInfoReport } from "./reads";
import { type InfoReportView, infoReportView } from "./views";

export type RequestInfoReportConfirmationInput = Readonly<{
  reportId: InfoReportId;
}>;

/**
 * An operator asks the place's stewards to check an open report; it
 * becomes confirmation-requested and cannot be taken back
 * (`spec/usecases/moderation.md` 「requestInfoReportConfirmation」; MOD-05 /
 * OM-05). Emits `info_report.confirmation_requested`, from which every
 * steward of the place is notified. Viewability and the listing's
 * existence are not checked.
 *
 * - `NotFoundError` (`INFO_REPORT_NOT_FOUND`), checked before access;
 *   `ForbiddenError` (`operate_service`, also when revoked before the
 *   commit).
 * - `BusinessRuleError`: `MODERATION_INFO_REPORT_NOT_OPEN` (checked
 *   first), `MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD`.
 * - `ConflictError` when a concurrent request or resolve commits first.
 */
export async function requestInfoReportConfirmation({
  container,
  actor,
  input,
}: ActorServiceArgs<RequestInfoReportConfirmationInput>): Promise<InfoReportView> {
  const now = container.clock.now();
  const requested = await container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireInfoReport(ctx, input.reportId);
    await authorizeRole(ctx, actor, "operate_service");
    const hasSteward = await placeHasSteward(ctx, found.entity.target.placeId);
    const { entity, eventDrafts } = InfoReport.requestConfirmation(
      found.entity,
      { placeHasSteward: hasSteward },
      now,
    );
    await ctx.infoReportRepository.save(entity, found.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
  return infoReportView(requested);
}
