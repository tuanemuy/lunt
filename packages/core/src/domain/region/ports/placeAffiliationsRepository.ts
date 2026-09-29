import type { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { TransactionalRepository } from "@repo/core/domain/common/transactionalRepository";
import type { PlaceAffiliations } from "../placeAffiliations";

/**
 * Persistence of each place's affiliations
 * (`spec/domains/region.md` 「PlaceAffiliationsRepository」). The aggregate
 * is never deleted: a place whose affiliations are all dissolved keeps an
 * empty one.
 *
 * - `findById`: `null` for a place never affiliated — read it as a place
 *   without affiliations.
 * - `insert`: `ConflictError` when the place already has one (two first
 *   affiliations at once: the later commit loses). The port does not check
 *   that the place or the regions exist.
 * - `save`: `ConflictError` on a version mismatch, `NotFoundError` when none
 *   is stored.
 * - `findAffiliatedPlaces`: the places currently affiliated with the region,
 *   whatever their status or suspension, newest affiliation first
 *   (`affiliatedAt` descending), ties by `PlaceId` ascending. Always equal
 *   to the stored aggregates; committed writes show immediately.
 */
export interface PlaceAffiliationsRepository
  extends Omit<TransactionalRepository<PlaceAffiliations, PlaceId>, "delete"> {
  findAffiliatedPlaces(
    regionId: RegionId,
    pagination: Pagination,
  ): Promise<PaginationResult<PlaceId>>;
}
