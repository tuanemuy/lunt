import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { Bookmark } from "@repo/core/domain/bookmark/bookmark";
import type { BookmarkRepository } from "@repo/core/domain/bookmark/ports/bookmarkRepository";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { AccountId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import { BookmarkRef } from "@repo/core/domain/common/refs";
import { isRehydrationError } from "@repo/core/domain/error";
import { mapDoError } from "../helpers";
import type {
  BookmarkRecord,
  BookmarkTargetRecord,
} from "../protocol/bookmark";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";

const targetRecord = (target: BookmarkRef): BookmarkTargetRecord => ({
  kind: target.kind,
  id: target.id,
});

/**
 * `BookmarkRepository` over the Lunt state object. Reads query the object
 * immediately; writes buffer in the unit of work and apply at commit, where
 * the store's key (`account_id`, `target_kind`, `target_id`) turns a
 * repeated add into a no-op. A target id is a reference the server never
 * minted for a device save, so only the account id is held to the
 * `IdGenerator` format on rehydration.
 */
export class DoBookmarkRepository implements BookmarkRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toBookmark(record: BookmarkRecord): Bookmark {
    if (this.idGenerator.parse(record.accountId) === null) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored bookmark has malformed account id: ${record.accountId}`,
      );
    }
    try {
      return Bookmark.reconstruct({
        accountId: record.accountId,
        target: record.target,
        savedAt: new Date(record.savedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored bookmark violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private static toRecord(bookmark: Bookmark): BookmarkRecord {
    return {
      accountId: bookmark.accountId,
      target: targetRecord(bookmark.target),
      savedAt: bookmark.savedAt.getTime(),
    };
  }

  async add(bookmark: Bookmark): Promise<void> {
    await this.addAll([bookmark]);
  }

  async addAll(bookmarks: readonly Bookmark[]): Promise<void> {
    if (bookmarks.length === 0) return;
    this.writes.push({
      kind: "bookmark.addAll",
      records: bookmarks.map(DoBookmarkRepository.toRecord),
    });
  }

  async remove(accountId: AccountId, target: BookmarkRef): Promise<void> {
    this.writes.push({
      kind: "bookmark.remove",
      accountId,
      target: targetRecord(target),
    });
  }

  async removeAllByAccount(accountId: AccountId): Promise<void> {
    this.writes.push({ kind: "bookmark.removeAllByAccount", accountId });
  }

  findByAccount(
    accountId: AccountId,
    pagination: Pagination,
  ): Promise<PaginationResult<Bookmark>> {
    return mapDoError("Failed to find bookmarks", async () => {
      const page = await this.client.query("bookmark.findByAccount", {
        accountId,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) => this.toBookmark(record)),
        count: page.count,
      };
    });
  }

  async findSavedTargets(
    accountId: AccountId,
    targets: readonly BookmarkRef[],
  ): Promise<readonly BookmarkRef[]> {
    IdBatch.assertWithinLimit(targets);
    if (targets.length === 0) return [];
    const found = await mapDoError("Failed to find saved targets", () =>
      this.client.query("bookmark.findSavedTargets", {
        accountId,
        targets: targets.map(targetRecord),
      }),
    );
    return found.map((record) => {
      if (!BookmarkRef.isKind(record.kind)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          `Stored bookmark has unknown target kind: ${record.kind}`,
        );
      }
      return BookmarkRef.create(record.kind, record.id);
    });
  }
}
