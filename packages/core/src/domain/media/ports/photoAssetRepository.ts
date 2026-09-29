import type { PhotoId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { ScanResult } from "@repo/core/domain/common/scan";
import type {
  TransactionalRepository,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { PhotoAsset } from "../photoAsset";

/**
 * Photo records (`spec/domains/media.md` 「PhotoAssetRepository」).
 *
 * - `insert`: `ConflictError` when the id is taken — including the id of a
 *   photo that was deleted: the port remembers deleted ids, so a resent
 *   registration never brings a deleted photo back.
 * - `save` / `delete`: optimistic lock (`ConflictError`); `NotFoundError`
 *   when the photo is not stored (never inserted, or deleted). A deleted
 *   photo appears in no query afterwards.
 * - `findByIds`: 0–100 ids (`COMMON_INVALID_INPUT` above), stored photos
 *   only with their version tokens, in no particular order.
 * - `findPageSweepable`: photos that are `discarded`, or `accepted` /
 *   unowned `stored` with `registeredAt < registeredBefore` (the caller's
 *   `PhotoPolicy.sweepBefore`). Oldest `registeredAt` first, ties by id
 *   ascending. Owned and deleted photos drop out, so a sweep re-reads page 1.
 *   A row that cannot be restored is reported in `unreadable` by photo id.
 *
 * There is no lookup by owner: aggregates hold the `PhotoId`s.
 */
export interface PhotoAssetRepository
  extends TransactionalRepository<PhotoAsset, PhotoId> {
  findByIds(ids: readonly PhotoId[]): Promise<readonly Versioned<PhotoAsset>[]>;
  findPageSweepable(
    registeredBefore: Date,
    pagination: Pagination,
  ): Promise<ScanResult<Versioned<PhotoAsset>>>;
}
