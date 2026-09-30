import {
  KeywordRelevance,
  type SearchableText,
  type SearchKeyword,
} from "@repo/core/domain/common/searchKeyword";
import {
  isBusinessRuleError,
  isRehydrationError,
} from "@repo/core/domain/error";
import type { SqlExec, SqlRow } from "../sql";

/**
 * The keyword-search text of every place, listing, region, occasion and
 * article (design.md D-25), kept in `search_texts` (migration 21):
 *
 * | column | type | meaning |
 * | --- | --- | --- |
 * | `target_kind` | TEXT | `place` / `listing` / `region` / `occasion` / `article` |
 * | `target_id` | TEXT | the target's id |
 * | `primary_text` | TEXT | `KeywordRelevance.normalizeText(…).primary` |
 * | `secondary_text` | TEXT | `KeywordRelevance.normalizeText(…).secondary` |
 *
 * Primary key `(target_kind, target_id)`. Each store writes its target's
 * row in the same command that writes the target (insert / save; a deleted
 * listing's row goes with it), from the domain's `searchableText` function
 * of the record it stores — so the text is always the committed content's.
 * Migration 21 backfills it from the stored rows with the same functions.
 * A target whose text cannot be built from its stored values has no row
 * and is found by no keyword.
 *
 * A search narrows candidates in SQL with `SEARCH_TEXT_MATCHES` — every
 * needle (`KeywordRelevance.needles`) is inside the primary or secondary
 * text, which is exactly `relevance ≥ 1` — and scores only those with
 * `KeywordRelevance.relevanceOfNormalized`, without reading or
 * normalising the targets' own texts again.
 */
export const SEARCH_TEXT_STATEMENTS: readonly string[] = [
  `CREATE TABLE search_texts (
    target_kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    primary_text TEXT NOT NULL,
    secondary_text TEXT NOT NULL,
    PRIMARY KEY (target_kind, target_id)
  )`,
];

export type SearchTargetKind =
  | "place"
  | "listing"
  | "region"
  | "occasion"
  | "article";

/**
 * `build()`'s text, or `null` when the stored values cannot be rebuilt into
 * it (a value object or rehydration refuses them).
 */
export function searchTextOf(
  build: () => SearchableText,
): SearchableText | null {
  try {
    return build();
  } catch (error) {
    if (isBusinessRuleError(error) || isRehydrationError(error)) return null;
    throw error;
  }
}

/** Writes (or, for `null`, removes) the target's normalised text. */
export function putSearchText(
  sql: SqlExec,
  kind: SearchTargetKind,
  id: string,
  text: SearchableText | null,
): void {
  if (text === null) {
    removeSearchText(sql, kind, id);
    return;
  }
  const normalized = KeywordRelevance.normalizeText(text);
  sql.exec(
    `INSERT INTO search_texts
       (target_kind, target_id, primary_text, secondary_text)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (target_kind, target_id) DO UPDATE SET
       primary_text = excluded.primary_text,
       secondary_text = excluded.secondary_text`,
    kind,
    id,
    normalized.primary,
    normalized.secondary,
  );
}

export function removeSearchText(
  sql: SqlExec,
  kind: SearchTargetKind,
  id: string,
): void {
  sql.exec(
    "DELETE FROM search_texts WHERE target_kind = ? AND target_id = ?",
    kind,
    id,
  );
}

/** Runs `write` after a command applied (a refused one writes nothing). */
export function afterApplied<T extends Readonly<{ kind: string }>>(
  outcome: T,
  write: () => void,
): T {
  if (outcome.kind === "applied") write();
  return outcome;
}

/**
 * Over `search_texts t`, binding one JSON array of needles: every needle
 * is inside `t.primary_text` or `t.secondary_text`. Neither text holds the
 * separator of the secondary values, nor does a needle, so this is
 * `KeywordRelevance.relevanceOfNormalized ≥ 1`.
 */
export const SEARCH_TEXT_MATCHES = `NOT EXISTS (
  SELECT 1 FROM json_each(?) n
   WHERE instr(t.primary_text, n.value) = 0
     AND instr(t.secondary_text, n.value) = 0)`;

/**
 * A kind's keyword-search candidates: `from` selects the target's `id` and
 * its recency as `newest`, joining `search_texts t` to the target;
 * `where` keeps the targets the search may show.
 */
export type SearchCandidates = Readonly<{ from: string; where: string }>;

/**
 * The candidates' statement: the needles bind first
 * (`SEARCH_TEXT_MATCHES`), then whatever `where` binds.
 */
/**
 * The candidates' statement. It returns the (short) primary text and, as
 * `secondary_needles`, the JSON array of the needles the secondary text
 * holds — never the (long) secondary text itself. The needles bind twice
 * (`needlesParam`), then whatever `where` binds.
 */
export const candidatesSql = (select: SearchCandidates): string =>
  `SELECT t.primary_text,
          (SELECT json_group_array(s.value) FROM json_each(?) s
            WHERE instr(t.secondary_text, s.value) > 0) AS secondary_needles,
          ${select.from}
     WHERE ${SEARCH_TEXT_MATCHES} AND ${select.where}`;

/** The one parameter `SEARCH_TEXT_MATCHES` binds. */
export const needlesParam = (keyword: SearchKeyword): string =>
  JSON.stringify(KeywordRelevance.needles(keyword));

/** What `candidatesSql` selects of the stored text. */
export type SearchTextRow = Readonly<{
  primary_text: string;
  secondary_needles: string;
}> &
  SqlRow;

/**
 * A candidate's `relevanceOfNormalized`, from its primary text and the
 * needles its secondary text holds (`KeywordRelevance.relevanceOfScored`).
 */
export const relevanceOfRow = (
  row: SearchTextRow,
  keyword: SearchKeyword,
): number => {
  const held = new Set<unknown>(JSON.parse(row.secondary_needles) as unknown[]);
  return KeywordRelevance.relevanceOfScored(
    { primary: row.primary_text, secondaryHas: (needle) => held.has(needle) },
    keyword,
  );
};
