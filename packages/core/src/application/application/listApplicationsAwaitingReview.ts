import type { ReviewDesk } from "@repo/core/domain/application/ports/applicationReviewDesk";
import { ReviewPolicy } from "@repo/core/domain/application/reviewPolicy";
import { Pagination } from "@repo/core/domain/common/pagination";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import {
  type ApplicationSummary,
  readRegistrations,
  summarizeAll,
} from "./views";

/**
 * OM-01's two sections of applications awaiting the operators: those they
 * decide as the approver (the operator-seat kinds, companion claims, and
 * region / occasion applications without stewards — 不在の代行), and those
 * they may decide as the overdue proxy.
 */
export type ReviewSection = "asApprover" | "asOverdueProxy";

export type ListApplicationsAwaitingReviewInput = Readonly<{
  section: ReviewSection;
  pagination: Pagination;
}>;

/**
 * One section's page: oldest under-review spell first (`status.since`,
 * then id), and the section's total.
 */
export type ApplicationsAwaitingReview = Readonly<{
  items: readonly ApplicationSummary[];
  count: number;
}>;

/**
 * An operator reads the applications under review awaiting the operators
 * (OPE-01, APP-08, OM-01), one section at a time. The sections never
 * overlap; returned and closed applications never appear. Subjects are
 * named by 「申請の対象の名称」 and marked 「まだない対象」.
 *
 * - `ForbiddenError` for anyone but an operator (nothing read is returned).
 * - `COMMON_INVALID_INPUT` on a bad pagination.
 */
export async function listApplicationsAwaitingReview({
  container,
  actor,
  input,
}: ActorServiceArgs<ListApplicationsAwaitingReviewInput>): Promise<ApplicationsAwaitingReview> {
  const pagination = Pagination.create(input.pagination);
  const desk: ReviewDesk =
    input.section === "asApprover"
      ? { section: "asApprover" }
      : {
          section: "asOverdueProxy",
          pendingSinceBefore: ReviewPolicy.overdueCutoff(
            container.reviewPolicy,
            container.clock.now(),
          ),
        };
  const page = await container.applicationReviewDesk.findPageAwaiting(
    desk,
    pagination,
  );
  const registrations = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    return readRegistrations(ctx, page.items);
  });
  return {
    items: await summarizeAll(
      container.contentDirectory,
      page.items,
      registrations,
    ),
    count: page.count,
  };
}
