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
  byCodePoint,
  countOf,
  idsParam,
  isViewable,
  offsetOf,
} from "./discovery";
import type { QueryHandlersOf } from "./queries";

/*
 * Discovery's article reads over Article's tables (`store/article.ts`
 * documents them). `isArticleViewable` is `publication_status =
 * 'published'` (articles have no suspension); 「新しい順」 is
 * `first_published_at DESC, id`, which `idx_articles_published` walks in
 * order. Showcased targets are looked up through the reverse index
 * `article_showcases`. Pages pick their ids first and read the (long) rows
 * of that page only, so a deep offset does not step through bodies.
 */

/** `VisibilityPolicy.isArticleViewable` over `articles a`. */
const ARTICLE_VIEWABLE = "a.publication_status = 'published'";

const A_COLUMNS = articleColumnsOf("a");

const NEWEST = "a.first_published_at DESC, a.id";

type Page<T> = Readonly<{ items: readonly T[]; count: number }>;

function findArticles(
  sql: SqlExec,
  page: number,
  limit: number,
): Page<ArticleRecord> {
  const from = `FROM articles a WHERE ${ARTICLE_VIEWABLE}`;
  return {
    items: sql
      .exec<ArticleRow>(
        `SELECT ${A_COLUMNS} FROM articles a WHERE a.id IN (
           SELECT a.id ${from} ORDER BY ${NEWEST} LIMIT ? OFFSET ?)
         ORDER BY ${NEWEST}`,
        limit,
        offsetOf(page, limit),
      )
      .toArray()
      .map(articleRowToRecord),
    count: countOf(sql, from),
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
  const from = `FROM articles a WHERE ${ARTICLE_VIEWABLE}
    AND a.id IN (SELECT s.article_id FROM article_showcases s
                   WHERE s.target_kind = ? AND s.target_id = ?)`;
  return {
    items: sql
      .exec<ArticleRow>(
        `SELECT ${A_COLUMNS} FROM articles a WHERE a.id IN (
           SELECT a.id ${from} ORDER BY ${NEWEST} LIMIT ? OFFSET ?)
         ORDER BY ${NEWEST}`,
        ref.kind,
        ref.id,
        limit,
        offsetOf(page, limit),
      )
      .toArray()
      .map(articleRowToRecord),
    count: countOf(sql, from, ref.kind, ref.id),
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
  const ranked = rows
    .flatMap((row) => {
      const relevance = KeywordRelevance.relevance(
        Article.searchableTextOf({ title: row.title, body: row.body }),
        keyword,
      );
      return relevance >= 1
        ? [{ id: row.id, relevance, newest: Number(row.first_published_at) }]
        : [];
    })
    .sort(
      (a, b) =>
        b.relevance - a.relevance ||
        b.newest - a.newest ||
        byCodePoint(a.id, b.id),
    );
  const slice = ranked.slice(
    offsetOf(args.page, args.limit),
    args.page * args.limit,
  );
  const found = publishedArticles(
    sql,
    slice.map((hit) => hit.id),
  );
  return {
    items: slice.flatMap((hit) => {
      const entry = found.get(hit.id);
      return entry === undefined ? [] : [{ entry, relevance: hit.relevance }];
    }),
    count: ranked.length,
  };
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
