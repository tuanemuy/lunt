import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { Article } from "@repo/core/domain/article/article";
import {
  KeywordRelevance,
  type SearchableText,
  SearchKeyword,
} from "@repo/core/domain/common/searchKeyword";
import { TextNormalization } from "@repo/core/domain/common/textNormalization";
import { Listing } from "@repo/core/domain/listing/listing";
import { ListingMatching } from "@repo/core/domain/listing/listingMatching";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { PlaceMatching } from "@repo/core/domain/place/matching";
import { Place } from "@repo/core/domain/place/place";
import { Region } from "@repo/core/domain/region/region";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type DiscoveryHarness,
  discoveryWorld,
} from "../__conformance__/discoveryFixtures";
import { PLACE_T0 } from "../__conformance__/placeFixtures";
import { DoDetailQueries } from "../detailQueries";
import { DoExplorationQueries } from "../explorationQueries";
import { DoFeedCandidateQueries } from "../feedCandidateQueries";
import { DoKeywordSearchQueries } from "../keywordSearchQueries";
import { DoReferenceQueries } from "../referenceQueries";
import type { SqlExec, SqlRow } from "../sql";
import { KEYWORD_SEARCH } from "../store/discovery";
import { ARTICLE_SEARCH } from "../store/discoveryArticles";
import { applyMigrations } from "../store/schema";
import {
  candidatesSql,
  needlesParam,
  putSearchText,
  relevanceOfRow,
  type SearchTargetKind,
  type SearchTextRow,
} from "../store/searchText";
import { createNodeHarness } from "../testing/nodeHarness";

type StoredText = SearchTextRow &
  Readonly<{ target_kind: string; target_id: string }>;

/** A fresh store, Discovery's ports over it, and its SQL. */
function setup() {
  const node = createNodeHarness();
  const idGenerator = new FakeIdGenerator();
  const { client } = node.state;
  const h: DiscoveryHarness = {
    uow: node.uow,
    savedEvents: node.savedEvents,
    detailQueries: new DoDetailQueries(client, idGenerator),
    referenceQueries: new DoReferenceQueries(client, idGenerator),
    explorationQueries: new DoExplorationQueries(client, idGenerator),
    keywordSearchQueries: new DoKeywordSearchQueries(client, idGenerator),
    feedCandidateQueries: new DoFeedCandidateQueries(client, idGenerator),
  };
  return { h, w: discoveryWorld(h), storage: node.state.storage };
}

const storedTexts = (sql: SqlExec): readonly StoredText[] =>
  sql
    .exec<StoredText>(
      `SELECT target_kind, target_id, primary_text, secondary_text
         FROM search_texts ORDER BY target_kind, target_id`,
    )
    .toArray();

const storedText = (sql: SqlExec, kind: SearchTargetKind, id: string) =>
  storedTexts(sql).find(
    (row) => row.target_kind === kind && row.target_id === id,
  );

/** What a fresh write stores for `text`. */
const expected = (text: SearchableText) => {
  const normalized = KeywordRelevance.normalizeText(text);
  return {
    primary_text: normalized.primary,
    secondary_text: normalized.secondary,
  };
};

/** One target of each kind, texts full of NFKC, width and case variants. */
async function everyKind(w: ReturnType<typeof setup>["w"]) {
  const P = await w.place({
    profile: { name: "ＣＡＦＥ　山田", description: "㍿ 山田商店" },
  });
  const L = await w.store(
    w.f.published(P.id, { name: "ﾓﾓ の桃", description: "Ｆｒｅｓｈ 直売" }),
  );
  const R = await w.region({
    name: "港町",
    content: { tagline: "ｳﾐ の町", description: "ﬁsh market" },
  });
  const E = await w.occasion({
    name: "港まつり",
    tagline: "ＡＢＣ",
    description: "e ́ combining",
  });
  const A = await w.article({
    title: "Ｔｉｔｌｅ ｶﾀｶﾅ",
    body: "本文 İstanbul",
  });
  return { P, L, R, E, A };
}

describe("search_texts (store/searchText.ts, D-25)", () => {
  it("each kind's insert writes its normalised searchable text", async () => {
    const { w, storage } = setup();
    const { P, L, R, E, A } = await everyKind(w);
    const { sql } = storage;
    expect(storedText(sql, "place", P.id)).toMatchObject(
      expected(PlaceMatching.searchableText(P)),
    );
    expect(storedText(sql, "listing", L.id)).toMatchObject(
      expected(ListingMatching.searchableText(L)),
    );
    expect(storedText(sql, "region", R.id)).toMatchObject(
      expected(Region.searchableText(R)),
    );
    expect(storedText(sql, "occasion", E.id)).toMatchObject(
      expected(Occasion.searchableText(E)),
    );
    expect(storedText(sql, "article", A.id)).toMatchObject(
      expected(Article.searchableText(A)),
    );
  });

  it("each kind's save rewrites it, and a deleted listing's goes with it", async () => {
    const { w, storage } = setup();
    const { P, L, R, E, A } = await everyKind(w);
    const { sql } = storage;
    const P2 = await w.updatePlace(
      P,
      (stored) =>
        Place.changeOperatingStatus(stored, "temporarilyClosed", PLACE_T0)
          .entity,
    );
    expect(storedText(sql, "place", P.id)).toMatchObject(
      expected(PlaceMatching.searchableText(P2)),
    );
    const L2 = await w.updateListing(
      L,
      (stored) => Listing.unpublish(stored, w.f.tick()).entity,
    );
    expect(storedText(sql, "listing", L.id)).toMatchObject(
      expected(ListingMatching.searchableText(L2)),
    );
    const R2 = await w.updateRegion(
      R,
      (stored) => Region.unpublish(stored, w.f.tick()).entity,
    );
    expect(storedText(sql, "region", R.id)).toMatchObject(
      expected(Region.searchableText(R2)),
    );
    const E2 = await w.updateOccasion(
      E,
      (stored) => Occasion.unpublish(stored, w.f.tick()).entity,
    );
    expect(storedText(sql, "occasion", E.id)).toMatchObject(
      expected(Occasion.searchableText(E2)),
    );
    const A2 = await w.updateArticle(
      A,
      (stored) =>
        Article.revise(
          stored,
          {
            title: "新しい題",
            body: "新しい本文",
            photoIds: stored.content.photos.items.map((p) => p.photoId),
            showcases: [],
          },
          w.f.tick(),
        ).entity,
    );
    expect(storedText(sql, "article", A.id)).toMatchObject(
      expected(Article.searchableText(A2)),
    );
    expect(storedText(sql, "article", A.id)?.primary_text).toBe("新しい題");
    await w.deleteListing(L2);
    expect(storedText(sql, "listing", L.id)).toBeUndefined();
  });

  it("a refused write leaves the stored text as it was", async () => {
    const { h, w, storage } = setup();
    const { A } = await everyKind(w);
    const before = storedText(storage.sql, "article", A.id);
    const retitled = Article.revise(
      A,
      {
        title: "別の題",
        body: "別の本文",
        photoIds: A.content.photos.items.map((p) => p.photoId),
        showcases: [],
      },
      w.f.tick(),
    ).entity;
    await expect(
      h.uow.run(({ articleRepository }) => articleRepository.insert(retitled)),
    ).rejects.toThrow();
    expect(storedText(storage.sql, "article", A.id)).toEqual(before);
  });

  it("migration 21's backfill stores exactly what fresh writes stored", async () => {
    const { w, storage } = setup();
    await everyKind(w);
    await everyKind(w);
    const P = await w.place({ suspended: true });
    await w.store(w.f.draft(P.id));
    await w.article({ state: "draft", title: "下書き" });
    const written = storedTexts(storage.sql);
    expect(written).toHaveLength(13);
    storage.sql.exec("DROP TABLE search_texts");
    storage.sql.exec("DELETE FROM _schema_migrations WHERE version = 21");
    applyMigrations(storage.sql, storage.transaction, new Date());
    expect(storedTexts(storage.sql)).toEqual(written);
  });

  it("every search starts from search_texts by kind, narrowing in SQL", () => {
    const { storage } = setup();
    const statements = [
      [KEYWORD_SEARCH.place(false), []],
      [KEYWORD_SEARCH.place(true), []],
      [KEYWORD_SEARCH.listing, []],
      [KEYWORD_SEARCH.region, []],
      [KEYWORD_SEARCH.occasion(false), []],
      [KEYWORD_SEARCH.occasion(true), ["2026-07-10"]],
      [ARTICLE_SEARCH, []],
    ] as const;
    for (const [select, bindings] of statements) {
      const plan = storage.sql
        .exec<Readonly<{ detail: string }> & SqlRow>(
          `EXPLAIN QUERY PLAN ${candidatesSql(select)}`,
          "[]",
          "[]",
          ...bindings,
        )
        .toArray()
        .map((row) => row.detail);
      expect(plan[0]).toBe(
        "SEARCH t USING INDEX sqlite_autoindex_search_texts_1 (target_kind=?)",
      );
      expect(plan.join("\n")).not.toContain("TEMP B-TREE");
    }
  });
});

/**
 * `KeywordRelevance.termScore` as it was before the stored texts: every
 * secondary value normalised and searched on its own.
 */
function referenceRelevance(
  text: SearchableText,
  keyword: SearchKeyword,
): number {
  let total = 0;
  for (const term of keyword.terms) {
    const needle = TextNormalization.normalize(term);
    const primary = TextNormalization.normalize(text.primary);
    const score =
      needle.length === 0
        ? 0
        : primary === needle
          ? 4
          : primary.startsWith(needle)
            ? 3
            : primary.includes(needle)
              ? 2
              : text.secondary.some((value) =>
                    TextNormalization.normalize(value).includes(needle),
                  )
                ? 1
                : 0;
    if (score === 0) return 0;
    total += score;
  }
  return total;
}

/**
 * Characters that normalise in interesting ways: case, full width, half-
 * width katakana, compatibility ligatures and squares, combining marks,
 * dotted capital I, and every kind of space.
 */
const ALPHABET = [
  ..."abcAB",
  ..."ＡＢａｂ",
  ..."１2",
  ..."ｶﾀｶナ",
  ..."ﾞ゛",
  ..."山田港",
  "㍿",
  "ﬁ",
  "́",
  "e",
  "İ",
  "ß",
  " ",
  "　",
  "\t",
];

const char = fc.constantFrom(...ALPHABET);
const text = fc.array(char, { maxLength: 12 }).map((cs) => cs.join(""));
const searchable = fc.record({
  primary: text,
  secondary: fc.array(text, { maxLength: 3 }),
});

/** A keyword of 1–3 words, some cut from `texts` and changed in case or width. */
const keywordFrom = (texts: readonly SearchableText[]) =>
  fc
    .array(
      fc.oneof(
        text,
        fc
          .tuple(
            fc.constantFrom(
              ...texts.flatMap((t) => [t.primary, ...t.secondary]),
              "",
            ),
            fc.nat(),
            fc.nat(),
            fc.constantFrom("same", "upper", "nfkd", "wide"),
          )
          .map(([source, a, b, how]) => {
            const from = source.length === 0 ? 0 : a % source.length;
            const cut = source.slice(from, from + 1 + (b % 6));
            if (how === "upper") return cut.toUpperCase();
            if (how === "nfkd") return cut.normalize("NFKD");
            if (how === "wide") {
              return cut.replace(/[!-~]/g, (c) =>
                String.fromCharCode(c.charCodeAt(0) + 0xfee0),
              );
            }
            return cut;
          }),
      ),
      { minLength: 1, maxLength: 3 },
    )
    .map((words) => SearchKeyword.parse(words.join(" ").slice(0, 100)));

describe("the search_texts prefilter (property)", () => {
  it("keeps exactly the texts relevance matches, and scores them as relevance does", () => {
    const { storage } = setup();
    const { sql } = storage;
    fc.assert(
      fc.property(
        fc
          .array(searchable, { minLength: 1, maxLength: 8 })
          .chain((texts) => fc.tuple(fc.constant(texts), keywordFrom(texts))),
        ([texts, keyword]) => {
          if (keyword === null) return;
          sql.exec("DELETE FROM search_texts");
          texts.forEach((t, i) => {
            putSearchText(sql, "article", String(i), t);
          });
          const kept = sql
            .exec<SearchTextRow & Readonly<{ id: string }>>(
              candidatesSql({
                from: "t.target_id AS id, 0 AS newest FROM search_texts t",
                where: "t.target_kind = 'article'",
              }),
              needlesParam(keyword),
              needlesParam(keyword),
            )
            .toArray();
          const matching = texts.flatMap((t, i) =>
            referenceRelevance(t, keyword) >= 1 ? [String(i)] : [],
          );
          expect(kept.map((row) => row.id).sort()).toEqual(matching.sort());
          for (const row of kept) {
            const source = texts[Number(row.id)];
            if (source === undefined) throw new Error("text");
            expect(relevanceOfRow(row, keyword)).toBe(
              referenceRelevance(source, keyword),
            );
            expect(KeywordRelevance.relevance(source, keyword)).toBe(
              referenceRelevance(source, keyword),
            );
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
