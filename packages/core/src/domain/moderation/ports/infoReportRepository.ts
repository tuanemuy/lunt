import type { InfoReportId, PlaceId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { TransactionalRepository } from "@repo/core/domain/common/transactionalRepository";
import type {
  ConfirmationRequestedInfoReport,
  InfoReport,
  OpenInfoReport,
} from "../infoReport";

/**
 * Info reports (`spec/domains/moderation.md` 「InfoReportRepository」),
 * reached through the unit of work as `infoReportRepository`. Reports are
 * never deleted, so there is no `delete`.
 *
 * - `insert`: `ConflictError` when the id is taken. No other uniqueness;
 *   the place, listing and reporter are not checked.
 * - `findById`: `null` when absent.
 * - `save`: `ConflictError` on a version mismatch, `NotFoundError` when
 *   absent.
 * - `findUnresolved`: open and confirmation-requested reports,
 *   `receivedAt` oldest first, ties by id ascending; `count` is every
 *   unresolved report.
 * - `findConfirmationRequestedByPlace`: the confirmation-requested reports
 *   whose `target.placeId` is `placeId` (the place's own and its
 *   listings'), `request.requestedAt` newest first, ties by id ascending.
 *
 * Committed writes show in every later read.
 */
export interface InfoReportRepository
  extends Omit<TransactionalRepository<InfoReport, InfoReportId>, "delete"> {
  findUnresolved(
    pagination: Pagination,
  ): Promise<
    PaginationResult<OpenInfoReport | ConfirmationRequestedInfoReport>
  >;
  findConfirmationRequestedByPlace(
    placeId: PlaceId,
    pagination: Pagination,
  ): Promise<PaginationResult<ConfirmationRequestedInfoReport>>;
}
