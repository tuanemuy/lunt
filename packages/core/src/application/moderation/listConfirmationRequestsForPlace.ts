import type { InfoReportId, PlaceId } from "@repo/core/domain/common/ids";
import { Pagination } from "@repo/core/domain/common/pagination";
import type {
  InfoReportCategory,
  InfoReportContent,
} from "@repo/core/domain/moderation/values";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { describeTargets } from "./reads";
import {
  type InfoReportTargetView,
  infoReportRefs,
  infoReportTargetView,
} from "./views";

export type ListConfirmationRequestsForPlaceInput = Readonly<{
  placeId: PlaceId;
  pagination: Pagination;
}>;

export type ConfirmationRequestRow = Readonly<{
  reportId: InfoReportId;
  target: InfoReportTargetView;
  category: InfoReportCategory;
  content: InfoReportContent;
  requestedAt: Date;
}>;

export type ListConfirmationRequestsForPlaceOutput = Readonly<{
  items: readonly ConfirmationRequestRow[];
  /** Every confirmation-requested report of the place. */
  count: number;
}>;

/**
 * A place's stewards read the confirmation requests still open for it —
 * about the place or any of its listings, deleted ones included — newest
 * request first (`spec/usecases/moderation.md`
 * 「listConfirmationRequestsForPlace」; MOD-06 / SM-01). Every steward reads
 * the same list.
 *
 * - `ForbiddenError` without `act_as_place` on the place (operators
 *   included, a vacant place included).
 * - `BusinessRuleError` `COMMON_INVALID_INPUT` for an invalid pagination.
 */
export async function listConfirmationRequestsForPlace({
  container,
  actor,
  input,
}: ActorServiceArgs<ListConfirmationRequestsForPlaceInput>): Promise<ListConfirmationRequestsForPlaceOutput> {
  const pagination = Pagination.create(input.pagination);
  const page = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "act_as_place", {
      kind: "place",
      id: input.placeId,
    });
    return ctx.infoReportRepository.findConfirmationRequestedByPlace(
      input.placeId,
      pagination,
    );
  });
  const described = await describeTargets(
    container.contentDirectory,
    infoReportRefs(page.items.map((report) => report.target)),
  );
  return {
    items: page.items.map((report) => ({
      reportId: report.id,
      target: infoReportTargetView(report.target, described),
      category: report.category,
      content: report.content,
      requestedAt: report.request.requestedAt,
    })),
    count: page.count,
  };
}
