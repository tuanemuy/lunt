import type { ArticleId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import type { TransactionalRepository } from "@repo/core/domain/common/transactionalRepository";
import type { Article, ArticleStatus, PublishedArticle } from "../article";

/**
 * Persistence of articles and the editing-side reads
 * (`spec/domains/article.md` 「ArticleRepository」). Articles are never
 * deleted, so there is no `delete`.
 *
 * - `insert`: `ConflictError` when the id is taken. Nothing else is unique;
 *   a showcased target need not exist.
 * - `save`: `ConflictError` on a version mismatch, `NotFoundError` when none
 *   is stored.
 * - `findPage`: every article, or those in `status` when not `null`, newest
 *   `updatedAt` first, ties by id ascending; `count` is the filtered total.
 * - `findPublishedByShowcases`: published articles showcasing any of
 *   `refs` (no size limit; empty → empty), each once, newest
 *   `firstPublishedAt` first, ties by id ascending. For choosing
 *   notification recipients, not for viewers.
 *
 * Committed writes show in every read immediately.
 */
export interface ArticleRepository
  extends Omit<TransactionalRepository<Article, ArticleId>, "delete"> {
  findPage(
    filter: Readonly<{ status: ArticleStatus | null }>,
    pagination: Pagination,
  ): Promise<PaginationResult<Article>>;
  findPublishedByShowcases(
    refs: readonly ShowcaseRef[],
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedArticle>>;
}
