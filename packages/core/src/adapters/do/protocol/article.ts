import type { QuerySpec } from "./queries";

/**
 * At-rest shape of an article (`Article.snapshot` with times as epoch
 * milliseconds). Values pass through the store unchecked; the request
 * side's `Article.reconstruct` rejects invalid ones as data-integrity
 * failures.
 */
export type ArticleRecord = Readonly<{
  id: string;
  publication: Readonly<{
    status: string;
    firstPublishedAt: number | null;
    reason: string | null;
  }>;
  content: Readonly<{
    title: string | null;
    body: string | null;
    /** In display order; the first is the cover. */
    photoIds: readonly string[];
    photosTakenDown: boolean;
    /** In the order the article shows them. */
    showcases: readonly Readonly<{ kind: string; id: string }>[];
  }>;
  updatedAt: number;
  version: number;
}>;

type Paged = Readonly<{ page: number; limit: number }>;

type Page<T> = Readonly<{ items: readonly T[]; count: number }>;

/**
 * Article's named reads and write commands on the Lunt state object. The
 * handler tables in `store/article.ts` cover every one.
 */
export type ArticleQueries = {
  "article.findById": QuerySpec<{ id: string }, ArticleRecord | null>;
  /** `status: null` reads every state; newest `updatedAt` first, then id. */
  "article.findPage": QuerySpec<
    Paged & { status: string | null },
    Page<ArticleRecord>
  >;
  /**
   * Published articles showcasing any of `refs` (any count), each once,
   * newest `firstPublishedAt` first, then id.
   */
  "article.findPublishedByShowcases": QuerySpec<
    Paged & { refs: readonly Readonly<{ kind: string; id: string }>[] },
    Page<ArticleRecord>
  >;
};

export type ArticleCommand =
  | Readonly<{ kind: "article.insert"; record: ArticleRecord }>
  | Readonly<{
      kind: "article.save";
      record: ArticleRecord;
      expectedVersion: number;
    }>;
