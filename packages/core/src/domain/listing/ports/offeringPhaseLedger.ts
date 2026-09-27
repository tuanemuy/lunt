import type { ListingId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { PublishedListing } from "../listing";
import type { OfferingPhase } from "../offering";
import type { OfferingPhaseRecord } from "../offeringWatch";

/** A published listing the daily check has to look at, with its recorded phase. */
export type DriftedListing = Readonly<{
  listing: PublishedListing;
  recorded: OfferingPhase | null;
}>;

/**
 * The last checked offering phase per published listing, kept apart from
 * the aggregate (`spec/domains/listing.md` 「OfferingPhaseLedger」).
 *
 * - `findPageDrifted`: published listings (suspended or not) with no
 *   record, a record of another version, or a record whose
 *   `nextChangeOn` is on or before `today` (`null` never is), by id. It
 *   compares versions and days only; it never derives a phase.
 * - `find`: the record, or `null` when there is none or its listing is gone.
 * - `record`: replaces the listing's one record (last write wins, no lock,
 *   the listing's version untouched); succeeds for a missing listing too.
 * - `remove`: deletes the record; succeeds when there is none.
 */
export interface OfferingPhaseLedger {
  findPageDrifted(
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<DriftedListing>>;
  find(listingId: ListingId): Promise<OfferingPhaseRecord | null>;
  record(entry: OfferingPhaseRecord): Promise<void>;
  remove(listingId: ListingId): Promise<void>;
}
