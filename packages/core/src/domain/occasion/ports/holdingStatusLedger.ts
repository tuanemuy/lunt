import type { OccasionId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { HoldingStatusRecord } from "../holdingStatusObserver";
import type { Occasion } from "../occasion";

/** An occasion the daily job has to look at again, with its record. */
export type OccasionToObserve = Readonly<{
  occasion: Occasion;
  record: HoldingStatusRecord | null;
}>;

/**
 * The holding status records, kept apart from the aggregate
 * (`spec/domains/occasion.md` 「HoldingStatusLedger」). Only the daily job
 * writes them, and never moves an occasion's version.
 *
 * - `findToObserve`: occasions (any publication, suspended or not) with
 *   no record, a record of another version, or a record whose
 *   `nextChangeOn` is on or before `today` (`null` never is), by
 *   `OccasionId` ascending. It compares versions and days only; it never
 *   derives a holding status.
 * - `find`: the record, or `null` when there is none or its occasion is
 *   gone.
 * - `put`: replaces the occasion's one record (last write wins, no lock);
 *   succeeds for a missing occasion too — such a record never shows.
 *
 * No error is part of the contract.
 */
export interface HoldingStatusLedger {
  findToObserve(
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<OccasionToObserve>>;
  find(occasionId: OccasionId): Promise<HoldingStatusRecord | null>;
  put(record: HoldingStatusRecord): Promise<void>;
}
