import type { ArticleRecord } from "./article";
import type { RefRecord, ScoredRecord } from "./discovery";
import type { QuerySpec } from "./queries";

type Paged = Readonly<{ page: number; limit: number }>;
type PageRecord<T> = Readonly<{ items: readonly T[]; count: number }>;

/**
 * Discovery's article reads on the Lunt state object
 * (`store/discoveryArticles.ts`). Only published articles are returned;
 * their showcases are as stored.
 */
export type DiscoveryArticleQueries = {
  /** Published articles, newest first (`first_published_at`, then id). */
  "discovery.findArticles": QuerySpec<Paged, PageRecord<ArticleRecord>>;
  /** The published article, else `null`. */
  "discovery.findArticle": QuerySpec<
    { articleId: string },
    ArticleRecord | null
  >;
  /**
   * Published articles showcasing `ref` itself, newest first; empty when
   * the target is not viewable or does not exist.
   */
  "discovery.findArticlesShowcasing": QuerySpec<
    Paged & { ref: RefRecord },
    PageRecord<ArticleRecord>
  >;
  /** `terms` are a `SearchKeyword`'s normalised terms. */
  "discovery.searchArticles": QuerySpec<
    Paged & { terms: readonly string[] },
    PageRecord<ScoredRecord<ArticleRecord>>
  >;
};
