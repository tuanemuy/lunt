import type { AccountId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { BookmarkRef } from "@repo/core/domain/common/refs";
import type { Bookmark } from "../bookmark";

/**
 * The accounts' bookmarks (`spec/domains/bookmark.md` 「BookmarkRepository」).
 * A bookmark has no id or version and never changes, every write is
 * idempotent, and writes commute: there is no optimistic lock, and no method
 * answers `ConflictError` or `NotFoundError`. Writes buffer in the unit of
 * work; a committed write shows in every later read.
 *
 * - `add`: adds the bookmark unless the account already holds its target —
 *   then the stored one (its `savedAt`) stays. The port guarantees that
 *   uniqueness, concurrent writers included; callers never search first.
 * - `addAll`: `add` for each of `BookmarkMerge.plan`'s result, all or
 *   nothing within the unit of work; no size limit, empty does nothing.
 * - `remove` / `removeAllByAccount`: delete if present, else nothing.
 * - `findByAccount`: the account's bookmarks, newest `savedAt` first, ties by
 *   `target.kind` (`listing` before `place`) then `target.id` ascending;
 *   `count` is the account's total. Not filtered by viewability.
 * - `findSavedTargets`: the targets among `targets` (0–100;
 *   `COMMON_INVALID_INPUT` above) the account has saved, in no order.
 *
 * Neither the account nor the target has to exist.
 */
export interface BookmarkRepository {
  add(bookmark: Bookmark): Promise<void>;
  addAll(bookmarks: readonly Bookmark[]): Promise<void>;
  remove(accountId: AccountId, target: BookmarkRef): Promise<void>;
  removeAllByAccount(accountId: AccountId): Promise<void>;
  findByAccount(
    accountId: AccountId,
    pagination: Pagination,
  ): Promise<PaginationResult<Bookmark>>;
  findSavedTargets(
    accountId: AccountId,
    targets: readonly BookmarkRef[],
  ): Promise<readonly BookmarkRef[]>;
}
