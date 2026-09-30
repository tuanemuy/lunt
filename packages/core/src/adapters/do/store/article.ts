import type {
  ArticleCommand,
  ArticleQueries,
  ArticleRecord,
} from "../protocol/article";
import type { SqlExec, SqlRow } from "../sql";
import type { CommandHandlersOf } from "./commands";
import type { ContentLookup } from "./contentLookups";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";
import { insertUnique, updateVersioned } from "./versioned";

/**
 * Article's tables (version 20). Rows are written only from the aggregate
 * snapshot (`article.insert` / `article.save`). Other domains' object-side
 * reads (Discovery, the directories) may read them; `ARTICLE_COLUMNS` +
 * `articleRowToRecord` (or `readArticleRecords`) rebuild an
 * `ArticleRecord`.
 *
 * `articles`, one row per article (never deleted):
 *
 * | column | type | meaning |
 * | --- | --- | --- |
 * | `id` | TEXT PK | `ArticleId` |
 * | `publication_status` | TEXT | `draft` / `published` / `unpublished` |
 * | `first_published_at` | INTEGER NULL | epoch ms of the first publication (`NULL` for a draft); survives re-publishing; orders 「新しい順」 |
 * | `unpublish_reason` | TEXT NULL | `byManager` / `photoTakedown` (unpublished only) |
 * | `title` | TEXT NULL | `ArticleTitle` |
 * | `body` | TEXT NULL | `ArticleBody` |
 * | `photo_ids` | TEXT | JSON array of `PhotoId`s in display order; `json_extract(photo_ids, '$[0]')` is the cover |
 * | `photos_taken_down` | INTEGER 0/1 | `PhotoSet.takenDown` |
 * | `showcases` | TEXT | JSON `[{ "kind", "id" }]` — the showcased targets (紹介先) in the article's order |
 * | `updated_at` | INTEGER | epoch ms; orders the editing list |
 * | `version` | INTEGER | optimistic-lock version |
 *
 * An article is viewable (`VisibilityPolicy.isArticleViewable`) exactly
 * when `publication_status = 'published'` (articles have no suspension);
 * `idx_articles_published` serves "viewable, newest first".
 *
 * `article_showcases` is the reverse index of `showcases`, rebuilt from the
 * snapshot on every write — one row per (article, position) with
 * `target_kind` (`listing` / `place` / `region` / `occasion`) and
 * `target_id`. Join it on `(target_kind, target_id)` for "the articles
 * showcasing a target" (`idx_article_showcases_target`); filter the joined
 * `articles` row on `publication_status = 'published'` for viewers. The
 * target need not exist and its own visibility is not recorded here.
 *
 * Photos live only in `photo_ids`; ownership is Media's (`photo_assets`,
 * owner `{ kind: "article", id }`). Keyword search reads `title` / `body`
 * through `Article.searchableText` (primary = title or "", secondary =
 * body) with `KeywordRelevance`, inside the object.
 *
 * Article emits no domain event of its own: `photos.released`
 * (`{ photoIds }`, aggregateId = article id) from a save that drops
 * photos or a takedown, and `content.photos_taken_down`
 * (`{ owner: { kind: "article", id }, photoIds, unpublished }`) from a
 * takedown — both shared-kernel events.
 */
const ARTICLE_TABLES_MIGRATION: Migration = {
  version: 20,
  name: "articles and showcases",
  statements: [
    `CREATE TABLE articles (
      id TEXT PRIMARY KEY,
      publication_status TEXT NOT NULL,
      first_published_at INTEGER,
      unpublish_reason TEXT,
      title TEXT,
      body TEXT,
      photo_ids TEXT NOT NULL,
      photos_taken_down INTEGER NOT NULL,
      showcases TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      version INTEGER NOT NULL
    )`,
    "CREATE INDEX idx_articles_updated ON articles (updated_at DESC, id)",
    `CREATE INDEX idx_articles_status_updated
       ON articles (publication_status, updated_at DESC, id)`,
    `CREATE INDEX idx_articles_published
       ON articles (first_published_at DESC, id)
       WHERE publication_status = 'published'`,
    `CREATE TABLE article_showcases (
      article_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      PRIMARY KEY (article_id, position)
    )`,
    `CREATE INDEX idx_article_showcases_target
       ON article_showcases (target_kind, target_id, article_id)`,
  ],
};

/**
 * Article's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Article has 20; take the next free number across
 * all domains for any later migration.
 */
export const ARTICLE_MIGRATIONS: readonly Migration[] = [
  ARTICLE_TABLES_MIGRATION,
];

export type ArticleRow = Readonly<{
  id: string;
  publication_status: string;
  first_published_at: number | null;
  unpublish_reason: string | null;
  title: string | null;
  body: string | null;
  photo_ids: string;
  photos_taken_down: number;
  showcases: string;
  updated_at: number;
  version: number;
}> &
  SqlRow;

/** Every column of `articles`, for `SELECT ${ARTICLE_COLUMNS} FROM articles`. */
export const ARTICLE_COLUMNS = `id, publication_status, first_published_at,
  unpublish_reason, title, body, photo_ids, photos_taken_down, showcases,
  updated_at, version`;

/** `ARTICLE_COLUMNS` qualified by `alias`, for joins. */
export const articleColumnsOf = (alias: string): string =>
  ARTICLE_COLUMNS.split(",")
    .map((column) => `${alias}.${column.trim()}`)
    .join(", ");

/**
 * A JSON column as stored — the parsed JSON, or the text itself when it is
 * not JSON — unchecked: the request side refuses anything malformed as a
 * data-integrity failure.
 */
function storedJson<T>(raw: string): T {
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    stored = raw;
  }
  return stored as T;
}

export const articleRowToRecord = (row: ArticleRow): ArticleRecord => ({
  id: row.id,
  publication: {
    status: row.publication_status,
    firstPublishedAt:
      row.first_published_at === null ? null : Number(row.first_published_at),
    reason: row.unpublish_reason,
  },
  content: {
    title: row.title,
    body: row.body,
    photoIds: storedJson<ArticleRecord["content"]["photoIds"]>(row.photo_ids),
    photosTakenDown: Number(row.photos_taken_down) === 1,
    showcases: storedJson<ArticleRecord["content"]["showcases"]>(row.showcases),
  },
  updatedAt: Number(row.updated_at),
  version: Number(row.version),
});

const articleValues = (record: ArticleRecord) => {
  const { publication, content } = record;
  return {
    publication_status: publication.status,
    first_published_at: publication.firstPublishedAt,
    unpublish_reason: publication.reason,
    title: content.title,
    body: content.body,
    photo_ids: JSON.stringify(content.photoIds),
    photos_taken_down: content.photosTakenDown ? 1 : 0,
    showcases: JSON.stringify(content.showcases),
    updated_at: record.updatedAt,
    version: record.version,
  };
};

/** Stored articles among `ids` (at most 100), any state, in id order. */
export function readArticleRecords(
  sql: SqlExec,
  ids: readonly string[],
): readonly ArticleRecord[] {
  if (ids.length === 0) return [];
  return sql
    .exec<ArticleRow>(
      `SELECT ${ARTICLE_COLUMNS} FROM articles
         WHERE id IN (SELECT value FROM json_each(?))
         ORDER BY id`,
      JSON.stringify(ids),
    )
    .toArray()
    .map(articleRowToRecord);
}

/** Rebuilds the article's rows of the reverse index from its snapshot. */
function indexShowcases(sql: SqlExec, record: ArticleRecord): void {
  sql.exec("DELETE FROM article_showcases WHERE article_id = ?", record.id);
  if (record.content.showcases.length === 0) return;
  sql.exec(
    `INSERT INTO article_showcases (article_id, position, target_kind, target_id)
       SELECT ?, CAST(key AS INTEGER), json_extract(value, '$.kind'),
              json_extract(value, '$.id')
         FROM json_each(?)`,
    record.id,
    JSON.stringify(record.content.showcases),
  );
}

type CountRow = Readonly<{ n: number }> & SqlRow;

const countOf = (rows: readonly CountRow[]): number => Number(rows[0]?.n ?? 0);

function findPage(
  sql: SqlExec,
  status: string | null,
  page: number,
  limit: number,
): Readonly<{ items: readonly ArticleRecord[]; count: number }> {
  const offset = (page - 1) * limit;
  if (status === null) {
    return {
      items: sql
        .exec<ArticleRow>(
          `SELECT ${ARTICLE_COLUMNS} FROM articles
             ORDER BY updated_at DESC, id LIMIT ? OFFSET ?`,
          limit,
          offset,
        )
        .toArray()
        .map(articleRowToRecord),
      count: countOf(
        sql.exec<CountRow>("SELECT COUNT(*) AS n FROM articles").toArray(),
      ),
    };
  }
  return {
    items: sql
      .exec<ArticleRow>(
        `SELECT ${ARTICLE_COLUMNS} FROM articles
           WHERE publication_status = ?
           ORDER BY updated_at DESC, id LIMIT ? OFFSET ?`,
        status,
        limit,
        offset,
      )
      .toArray()
      .map(articleRowToRecord),
    count: countOf(
      sql
        .exec<CountRow>(
          "SELECT COUNT(*) AS n FROM articles WHERE publication_status = ?",
          status,
        )
        .toArray(),
    ),
  };
}

/**
 * The published articles among those showcasing any target in `refs`
 * (a JSON array of `{ kind, id }`), for joining into a larger query as
 * `id IN (${PUBLISHED_SHOWCASING})` with `refs` as its one parameter.
 */
export const PUBLISHED_SHOWCASING = `SELECT s.article_id
  FROM article_showcases s
  JOIN json_each(?) r
    ON s.target_kind = json_extract(r.value, '$.kind')
   AND s.target_id = json_extract(r.value, '$.id')`;

function findPublishedByShowcases(
  sql: SqlExec,
  refs: readonly Readonly<{ kind: string; id: string }>[],
  page: number,
  limit: number,
): Readonly<{ items: readonly ArticleRecord[]; count: number }> {
  if (refs.length === 0) return { items: [], count: 0 };
  const wanted = JSON.stringify(refs.map(({ kind, id }) => ({ kind, id })));
  const where = `publication_status = 'published'
    AND id IN (${PUBLISHED_SHOWCASING})`;
  return {
    items: sql
      .exec<ArticleRow>(
        `SELECT ${ARTICLE_COLUMNS} FROM articles WHERE ${where}
           ORDER BY first_published_at DESC, id LIMIT ? OFFSET ?`,
        wanted,
        limit,
        (page - 1) * limit,
      )
      .toArray()
      .map(articleRowToRecord),
    count: countOf(
      sql
        .exec<CountRow>(
          `SELECT COUNT(*) AS n FROM articles WHERE ${where}`,
          wanted,
        )
        .toArray(),
    ),
  };
}

const describeArticle = (id: string): string => `Article ${id}`;

export const articleQueryHandlers: QueryHandlersOf<ArticleQueries> = {
  "article.findById": (sql, { id }) => readArticleRecords(sql, [id])[0] ?? null,
  "article.findPage": (sql, { status, page, limit }) =>
    findPage(sql, status, page, limit),
  "article.findPublishedByShowcases": (sql, { refs, page, limit }) =>
    findPublishedByShowcases(sql, refs, page, limit),
};

function afterApplied<T extends { kind: string }>(
  outcome: T,
  index: () => void,
): T {
  if (outcome.kind === "applied") index();
  return outcome;
}

export const articleCommandHandlers: CommandHandlersOf<ArticleCommand> = {
  "article.insert": (sql, { record }) =>
    afterApplied(
      insertUnique(
        sql,
        "articles",
        { id: record.id, ...articleValues(record) },
        describeArticle(record.id),
      ),
      () => indexShowcases(sql, record),
    ),
  "article.save": (sql, { record, expectedVersion }) =>
    afterApplied(
      updateVersioned(
        sql,
        "articles",
        { id: record.id },
        articleValues(record),
        expectedVersion,
        describeArticle(record.id),
      ),
      () => indexShowcases(sql, record),
    ),
};

/**
 * The `article` entry of `CONTENT_LOOKUPS`: stored articles among `ids`
 * with their titles (as the name) and current photos in order, any state.
 */
export const articleContentLookup: ContentLookup = (sql, ids) =>
  readArticleRecords(sql, ids).map((record) => ({
    id: record.id,
    name: record.content.title,
    photoIds: record.content.photoIds,
  }));
