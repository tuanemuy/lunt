import type { OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { TransactionalRepository } from "@repo/core/domain/common/transactionalRepository";
import type { Participation, ParticipationKey } from "../participation";

/**
 * Persistence of participations, keyed by the occasion and place pair
 * (`spec/domains/occasion.md` 「ParticipationRepository」).
 *
 * - `insert`: `ConflictError` when the pair already takes part — one
 *   participation per pair; of a concurrent approval and direct addition
 *   the later commit conflicts.
 * - `findById`: the pair's participation, or `null` while it does not
 *   take part.
 * - `save` / `delete`: `ConflictError` on a version mismatch,
 *   `NotFoundError` when none is stored (a dissolved one included).
 * - `findByOccasion`: the occasion's participations, newest
 *   `participatedAt` first, ties by `PlaceId` ascending; any state of the
 *   place.
 * - `findByPlace`: the place's participations, newest `participatedAt`
 *   first, ties by `OccasionId` ascending; any state of the occasion.
 *
 * The occasion, place and listings referred to are not checked.
 * Committed writes show immediately.
 */
export interface ParticipationRepository
  extends TransactionalRepository<Participation, ParticipationKey> {
  findByOccasion(
    occasionId: OccasionId,
    pagination: Pagination,
  ): Promise<PaginationResult<Participation>>;
  findByPlace(
    placeId: PlaceId,
    pagination: Pagination,
  ): Promise<PaginationResult<Participation>>;
}
