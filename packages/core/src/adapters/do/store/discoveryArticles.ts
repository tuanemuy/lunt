import { Article } from "@repo/core/domain/article/article";
import {
  KeywordRelevance,
  SearchKeyword,
} from "@repo/core/domain/common/searchKeyword";
import type { ArticleRecord } from "../protocol/article";
import type { ScoredRecord } from "../protocol/discovery";
import type { DiscoveryArticleQueries } from "../protocol/discoveryArticles";
import type { SqlExec, SqlRow } from "../sql";
import {
  type ArticleRow,
  articleColumnsOf,
  articleRowToRecord,
} from "./article";
import {
  countOf,
  idsParam,
  isViewable,
  offsetOf,
  rank,
  scoredPage,
} from "./discovery";
import type { QueryHandlersOf } from "./queries";

/*
 * Discovery's article reads over Article's tables (`store/article.ts`
 * documents them). `isArticleViewable` is `publication_status =
 * 'published'` (articles have no suspension); 「新しい順」 is
 * `first_published_at DESC, id`. The published list walks
 * `idx_articles_published` in that order — named with `INDEXED BY`, since
 * without statistics (no ANALYZE) the planner prefers the status index and
 * sorts every published article. A target's articles start from
 * `idx_article_showcases_target` and sort only that target's articles. Pages
 * pick their ids first and read the (long) rows of that page only, so a
 * deep offset does not step through bodies.
 */

/** `VisibilityPolicy.isArticleViewable` over `articles a`. */
const ARTICLE_VIEWABLE = "a.publication_status = 'published'";

const A_COLUMNS = articleColumnsOf("a");

const NEWEST = "a.first_published_at DESC, a.id";

const PUBLISHED_FROM = `FROM articles a INDEXED BY idx_articles_published
  WHERE ${ARTICLE_VIEWABLE}`;

/** Binds `target_kind`, `target_id`. `ShowcaseList` holds a target once, so no article repeats. */
const SHOWCASING_FROM = `FROM article_showcases s
  JOIN articles a ON a.id = s.article_id
  WHERE s.target_kind = ? AND s.target_id = ? AND ${ARTICLE_VIEWABLE}`;

/**
 * The statements whose plans the Node plan test pins: one page of ids
 * (binds `LIMIT`, `OFFSET` after the `from` bindings) and the count.
 */
export const DISCOVERY_ARTICLE_PLANS = {
  publishedIds: `SELECT a.id ${PUBLISHED_FROM}
    ORDER BY ${NEWEST} LIMIT ? OFFSET ?`,
  publishedCount: `SELECT COUNT(*) AS n ${PUBLISHED_FROM}`,
  showcasingIds: `SELECT a.id ${SHOWCASING_FROM}
    ORDER BY ${NEWEST} LIMIT ? OFFSET ?`,
  showcasingCount: `SELECT COUNT(*) AS n ${SHOWCASING_FROM}`,
} as const;

/** The whole rows of the ids `idsSql` selects, newest first. */
const rowsOf = (idsSql: string) => `SELECT ${A_COLUMNS} FROM articles a
  WHERE a.id IN (${idsSql}) ORDER BY ${NEWEST}`;

type Page<T> = Readonly<{ items: readonly T[]; count: number }>;

function findArticles(
  sql: SqlExec,
  page: number,
  limit: number,
): Page<ArticleRecord> {
  return {
    items: sql
      .exec<ArticleRow>(
        rowsOf(DISCOVERY_ARTICLE_PLANS.publishedIds),
        limit,
        offsetOf(page, limit),
      )
      .toArray()
      .map(articleRowToRecord),
    count: countOf(sql, PUBLISHED_FROM),
  };
}

function findArticle(sql: SqlExec, articleId: string): ArticleRecord | null {
  const [row] = sql
    .exec<ArticleRow>(
      `SELECT ${A_COLUMNS} FROM articles a
         WHERE a.id = ? AND ${ARTICLE_VIEWABLE}`,
      articleId,
    )
    .toArray();
  return row === undefined ? null : articleRowToRecord(row);
}

function findArticlesShowcasing(
  sql: SqlExec,
  args: DiscoveryArticleQueries["discovery.findArticlesShowcasing"]["args"],
): Page<ArticleRecord> {
  const { ref, page, limit } = args;
  if (!isViewable(sql, ref)) return { items: [], count: 0 };
  return {
    items: sql
      .exec<ArticleRow>(
        rowsOf(DISCOVERY_ARTICLE_PLANS.showcasingIds),
        ref.kind,
        ref.id,
        limit,
        offsetOf(page, limit),
      )
      .toArray()
      .map(articleRowToRecord),
    count: countOf(sql, SHOWCASING_FROM, ref.kind, ref.id),
  };
}

type SearchRow = Readonly<{
  id: string;
  title: string | null;
  body: string | null;
  first_published_at: number;
}> &
  SqlRow;

/** The published articles among `ids`, keyed by id. */
function publishedArticles(
  sql: SqlExec,
  ids: readonly string[],
): ReadonlyMap<string, ArticleRecord> {
  if (ids.length === 0) return new Map();
  return new Map(
    sql
      .exec<ArticleRow>(
        `SELECT ${A_COLUMNS} FROM articles a
           WHERE a.id IN (SELECT value FROM json_each(?))
             AND ${ARTICLE_VIEWABLE}`,
        idsParam(ids),
      )
      .toArray()
      .map((row) => [row.id, articleRowToRecord(row)]),
  );
}

// Matching is `Article.searchableTextOf` with `KeywordRelevance`, in the
// object: texts are compared after NFKC / case / whitespace normalisation,
// which a LIKE cannot express. Only the scored columns of every published
// article are read; whole rows only for the page, which the request side
// rehydrates (a malformed one is a data-integrity failure there, as for
// the other kinds).
function searchArticles(
  sql: SqlExec,
  args: DiscoveryArticleQueries["discovery.searchArticles"]["args"],
): Page<ScoredRecord<ArticleRecord>> {
  const keyword = SearchKeyword.fromTerms(args.terms);
  if (keyword === null) return { items: [], count: 0 };
  const rows = sql
    .exec<SearchRow>(
      `SELECT a.id, a.title, a.body, a.first_published_at
         FROM articles a WHERE ${ARTICLE_VIEWABLE}`,
    )
    .toArray();
  const ranked = rank(
    rows.map((row) => ({
      id: row.id,
      relevance: KeywordRelevance.relevance(
        Article.searchableTextOf({ title: row.title, body: row.body }),
        keyword,
      ),
      newest: Number(row.first_published_at),
    })),
  );
  return scoredPage(ranked, args.page, args.limit, (ids) =>
    publishedArticles(sql, ids),
  );
}

export const discoveryArticleQueryHandlers: QueryHandlersOf<DiscoveryArticleQueries> =
  {
    "discovery.findArticles": (sql, { page, limit }) =>
      findArticles(sql, page, limit),
    "discovery.findArticle": (sql, { articleId }) =>
      findArticle(sql, articleId),
    "discovery.findArticlesShowcasing": (sql, args) =>
      findArticlesShowcasing(sql, args),
    "discovery.searchArticles": (sql, args) => searchArticles(sql, args),
  };
