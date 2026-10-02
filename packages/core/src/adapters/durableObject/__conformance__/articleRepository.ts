import {
  ConflictError,
  NotFoundError,
  SystemError,
} from "@repo/core/application/errors";
import { Article } from "@repo/core/domain/article/article";
import type { ArticleId } from "@repo/core/domain/common/ids";
import { ListingId, PlaceId } from "@repo/core/domain/common/ids";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import {
  ARTICLE_T0,
  articleContent,
  articleIds,
  articlePage,
  articlesShowcasing,
  articleTicker,
  draftArticle,
  EMPTY_ARTICLE_CONTENT,
  findArticle,
  getArticle,
  insertArticles,
  publishedArticle,
  saveArticle,
  unpublishedArticle,
  updateArticle,
} from "./articleFixtures";
import { barrier, ScopeAbort } from "./fixtures";
import type { HarnessFactory } from "./harness";

const idsOf = (result: Readonly<{ items: readonly Article[] }>) =>
  result.items.map((article) => article.id);

const at = (minutes: number): Date =>
  new Date(ARTICLE_T0.getTime() + minutes * 60_000);

/** `spec/testcases/ports/articleRepository.md`. */
export function describeArticleRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("ArticleRepository contract", () => {
    describe("insert・findById・save", () => {
      it("articleRepository#1 読みものがない / タイトル・本文・写真2枚・紹介先3つを持つ下書きを insert し、findById する", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const photos = [ids.photo(), ids.photo()];
        const showcases = [ids.occasion(), ids.listing(), ids.place()];
        const a = draftArticle(
          ids.article(),
          articleContent({ photoIds: photos, showcases }),
        );
        await insertArticles(h, a);
        const found = await getArticle(h, a.id);
        expect(found.entity).toEqual(a);
        expect(found.entity.publication).toEqual({ status: "draft" });
        expect(found.entity.content.photos.items).toEqual(
          photos.map((photoId) => ({ photoId })),
        );
        expect(found.entity.content.showcases).toEqual(showcases);
        expect(found.expectedVersion).toBe(a.version);
      });

      it("articleRepository#2 読みものがない / タイトルも本文も null で、写真も紹介先もない下書きを insert し、findById する", async () => {
        const h = await makeHarness();
        const a = draftArticle(articleIds().article(), EMPTY_ARTICLE_CONTENT);
        await insertArticles(h, a);
        const found = (await getArticle(h, a.id)).entity;
        expect(found).toEqual(a);
        expect(found.content).toMatchObject({ title: null, body: null });
        expect(found.content.photos.items).toEqual([]);
        expect(found.content.showcases).toEqual([]);
      });

      it("articleRepository#3 読みものがない / 存在しない ArticleId で findById する", async () => {
        const h = await makeHarness();
        expect(await findArticle(h, articleIds().article())).toBeNull();
      });

      it("articleRepository#4 insert した下書き / findById の expectedVersion で、publish の結果を save し、findById する", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const a = draftArticle(
          ids.article(),
          articleContent({ photoIds: [ids.photo()] }),
        );
        await insertArticles(h, a);
        const read = await getArticle(h, a.id);
        const published = Article.publish(read.entity, at(5));
        await saveArticle(h, published, read.expectedVersion);
        const found = (await getArticle(h, a.id)).entity;
        expect(found).toEqual(published);
        expect(found.publication).toEqual({
          status: "published",
          firstPublishedAt: at(5),
        });
      });

      it("articleRepository#5 公開中の読みもの / unpublish の結果を save し、findById する", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const a = publishedArticle(
          ids.article(),
          articleContent({ photoIds: [ids.photo()] }),
        );
        await insertArticles(h, a);
        const saved = await updateArticle(h, a.id, (article) =>
          Article.unpublish(article, at(5)),
        );
        const found = (await getArticle(h, a.id)).entity;
        expect(found).toEqual(saved);
        expect(found.publication).toEqual({
          status: "unpublished",
          firstPublishedAt: ARTICLE_T0,
          reason: "byManager",
        });
      });

      it("articleRepository#6 写真1枚の公開中の読みもの / takeDownPhotos の結果を save し、findById する", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const photo = ids.photo();
        const a = publishedArticle(
          ids.article(),
          articleContent({ photoIds: [photo] }),
        );
        await insertArticles(h, a);
        const saved = await updateArticle(
          h,
          a.id,
          (article) => Article.takeDownPhotos(article, [photo], at(5)).entity,
        );
        const found = (await getArticle(h, a.id)).entity;
        expect(found).toEqual(saved);
        expect(found.publication).toEqual({
          status: "unpublished",
          firstPublishedAt: ARTICLE_T0,
          reason: "photoTakedown",
        });
        expect(found.content.photos.items).toEqual([]);
        expect(found.content.photos.takenDown).toBe(true);
      });

      it("articleRepository#7 insert した読みもの / revise の結果を save し、findById する", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const a = draftArticle(ids.article());
        await insertArticles(h, a);
        const content = articleContent({
          title: "根津の坂道",
          photoIds: [ids.photo()],
          showcases: [ids.region()],
        });
        const saved = await updateArticle(
          h,
          a.id,
          (article) => Article.revise(article, content, at(7)).entity,
        );
        const found = (await getArticle(h, a.id)).entity;
        expect(found).toEqual(saved);
        expect(found.content.title).toBe("根津の坂道");
        expect(found.content.showcases).toEqual(content.showcases);
        expect(found.updatedAt).toEqual(at(7));
      });

      it("articleRepository#8 insert した読みもの / 同じ ArticleId の読みものを insert する", async () => {
        const h = await makeHarness();
        const id = articleIds().article();
        const first = draftArticle(id);
        await insertArticles(h, first);
        await expect(
          insertArticles(
            h,
            draftArticle(id, articleContent({ title: "別のタイトル" })),
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getArticle(h, id)).entity).toEqual(first);
      });

      it("articleRepository#9 読みもの A がある。一度も insert していない ArticleId の読みもの Z / A の findById で得た expectedVersion で、Z を save する", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const a = draftArticle(ids.article());
        await insertArticles(h, a);
        const read = await getArticle(h, a.id);
        const z = draftArticle(ids.article());
        await expect(
          saveArticle(h, z, read.expectedVersion),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect((await getArticle(h, a.id)).entity).toEqual(a);
        expect(await findArticle(h, z.id)).toBeNull();
      });

      it("articleRepository#10 同じ紹介先を持つ読みものが2つ / 2つ目を insert する", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const showcase = ids.listing();
        const a = draftArticle(
          ids.article(),
          articleContent({ showcases: [showcase] }),
        );
        const b = draftArticle(
          ids.article(),
          articleContent({ showcases: [showcase] }),
        );
        await insertArticles(h, a);
        await insertArticles(h, b);
        expect((await getArticle(h, b.id)).entity).toEqual(b);
      });

      it("articleRepository#11 指す先のない紹介先を持つ読みもの / insert する", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const a = draftArticle(
          ids.article(),
          articleContent({ showcases: [ids.place(), ids.occasion()] }),
        );
        await insertArticles(h, a);
        expect((await getArticle(h, a.id)).entity).toEqual(a);
      });

      it("refuses to insert or save a showcase id the generator would not read back", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const foreign: ShowcaseRef = {
          kind: "listing",
          id: ListingId.create("listing-1"),
        };
        const bad = draftArticle(
          ids.article(),
          articleContent({ showcases: [foreign] }),
        );
        const insertError = await insertArticles(h, bad).then(
          () => null,
          (error: unknown) => error,
        );
        expect(insertError).toBeInstanceOf(SystemError);
        expect(await findArticle(h, bad.id)).toBeNull();

        const a = draftArticle(ids.article());
        await insertArticles(h, a);
        const read = await getArticle(h, a.id);
        const saveError = await saveArticle(
          h,
          Article.revise(
            read.entity,
            articleContent({ showcases: [foreign] }),
            at(1),
          ).entity,
          read.expectedVersion,
        ).then(
          () => null,
          (error: unknown) => error,
        );
        expect(saveError).toBeInstanceOf(SystemError);
        expect((await getArticle(h, a.id)).entity).toEqual(a);
        expect(await articlePage(h, null)).toEqual({ items: [a], count: 1 });
      });
    });

    describe("楽観ロック", () => {
      it("articleRepository#12 同じ読みものを2回 findById し、同じ expectedVersion を2つ得た / 1つ目で save を確定し、2つ目で save する", async () => {
        const h = await makeHarness();
        const a = draftArticle(articleIds().article());
        await insertArticles(h, a);
        const first = await getArticle(h, a.id);
        const second = await getArticle(h, a.id);
        expect(second.expectedVersion).toBe(first.expectedVersion);
        const one = Article.revise(
          first.entity,
          articleContent({ title: "一つ目" }),
          at(1),
        ).entity;
        await saveArticle(h, one, first.expectedVersion);
        await expect(
          saveArticle(
            h,
            Article.revise(
              second.entity,
              articleContent({ title: "二つ目" }),
              at(2),
            ).entity,
            second.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getArticle(h, a.id)).entity).toEqual(one);
      });

      it("articleRepository#13 編集の revise と、申立てによる takeDownPhotos が、同じ版の読みものを読んだ / takeDownPhotos の save を先に確定し、revise の save を後に確定する", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const [x, y] = [ids.photo(), ids.photo()];
        const a = publishedArticle(
          ids.article(),
          articleContent({ photoIds: [x, y] }),
        );
        await insertArticles(h, a);
        const editor = await getArticle(h, a.id);
        const operator = await getArticle(h, a.id);
        const takenDown = Article.takeDownPhotos(
          operator.entity,
          [x],
          at(1),
        ).entity;
        await saveArticle(h, takenDown, operator.expectedVersion);
        await expect(
          saveArticle(
            h,
            Article.revise(
              editor.entity,
              articleContent({ title: "新しいタイトル", photoIds: [x, y] }),
              at(2),
            ).entity,
            editor.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        const found = (await getArticle(h, a.id)).entity;
        expect(found).toEqual(takenDown);
        expect(found.content.photos.items).toEqual([{ photoId: y }]);
      });

      it("articleRepository#14 同じ読みものの同じ expectedVersion で、2つの save を同時に実行する / 両方の完了を待つ", async () => {
        const h = await makeHarness();
        const a = draftArticle(articleIds().article());
        await insertArticles(h, a);
        const tick = articleTicker();
        const bothRead = barrier(2);
        const attempt = (title: string) =>
          h.uow.run(async ({ articleRepository }) => {
            const read = await articleRepository.findById(a.id);
            if (read === null) throw new Error("article missing");
            await bothRead();
            const next = Article.revise(
              read.entity,
              articleContent({ title }),
              tick(),
            ).entity;
            await articleRepository.save(next, read.expectedVersion);
            return next;
          });
        const results = await Promise.allSettled([
          attempt("一つ目"),
          attempt("二つ目"),
        ]);
        const fulfilled = results.filter(
          (r): r is PromiseFulfilledResult<Article> => r.status === "fulfilled",
        );
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        expect((await getArticle(h, a.id)).entity).toEqual(fulfilled[0]?.value);
      });

      it("articleRepository#15 save を確定した読みもの / もう一度 findById し、新しい expectedVersion で save する", async () => {
        const h = await makeHarness();
        const a = draftArticle(articleIds().article());
        await insertArticles(h, a);
        await updateArticle(
          h,
          a.id,
          (article) =>
            Article.revise(article, articleContent({ title: "一つ目" }), at(1))
              .entity,
        );
        const again = await updateArticle(
          h,
          a.id,
          (article) =>
            Article.revise(article, articleContent({ title: "二つ目" }), at(2))
              .entity,
        );
        expect((await getArticle(h, a.id)).entity).toEqual(again);
      });
    });

    describe("findPage", () => {
      /** A draft, a published and an unpublished article, updated in that order. */
      async function oneOfEach(h: Awaited<ReturnType<HarnessFactory>>) {
        const ids = articleIds();
        const draft = draftArticle(ids.article(), articleContent(), at(1));
        const published = publishedArticle(
          ids.article(),
          articleContent({ photoIds: [ids.photo()] }),
          at(2),
        );
        const unpublished = unpublishedArticle(
          ids.article(),
          articleContent({ photoIds: [ids.photo()] }),
          at(3),
        );
        await insertArticles(h, draft, published, unpublished);
        return { draft, published, unpublished };
      }

      it("articleRepository#16 下書き・公開・公開の取り下げの読みものが1件ずつ / status: null で読む", async () => {
        const h = await makeHarness();
        const { draft, published, unpublished } = await oneOfEach(h);
        const page = await articlePage(h, null);
        expect(idsOf(page)).toEqual([unpublished.id, published.id, draft.id]);
        expect(page.count).toBe(3);
      });

      it('articleRepository#17 上と同じ / status: "draft" で読む', async () => {
        const h = await makeHarness();
        const { draft } = await oneOfEach(h);
        expect(await articlePage(h, "draft")).toEqual({
          items: [draft],
          count: 1,
        });
      });

      it('articleRepository#18 上と同じ / status: "published" で読む', async () => {
        const h = await makeHarness();
        const { published } = await oneOfEach(h);
        expect(await articlePage(h, "published")).toEqual({
          items: [published],
          count: 1,
        });
      });

      it('articleRepository#19 上と同じ / status: "unpublished" で読む', async () => {
        const h = await makeHarness();
        const { unpublished } = await oneOfEach(h);
        expect(await articlePage(h, "unpublished")).toEqual({
          items: [unpublished],
          count: 1,
        });
      });

      it('articleRepository#20 reason が byManager と photoTakedown の、公開の取り下げの読みもの / status: "unpublished" で読む', async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const byManager = unpublishedArticle(
          ids.article(),
          articleContent({ photoIds: [ids.photo()] }),
          at(1),
        );
        const photo = ids.photo();
        const byTakedown = Article.takeDownPhotos(
          publishedArticle(
            ids.article(),
            articleContent({ photoIds: [photo] }),
            at(1),
          ),
          [photo],
          at(2),
        ).entity;
        await insertArticles(h, byManager, byTakedown);
        const page = await articlePage(h, "unpublished");
        expect(page.count).toBe(2);
        const reasons = new Map(
          page.items.map((article) => [
            article.id,
            article.publication.status === "unpublished"
              ? article.publication.reason
              : null,
          ]),
        );
        expect(reasons.get(byManager.id)).toBe("byManager");
        expect(reasons.get(byTakedown.id)).toBe("photoTakedown");
      });

      it("articleRepository#21 読みものが3件。updatedAt は T1 < T2 < T3 / status: null で読む", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const t1 = draftArticle(ids.article(), articleContent(), at(1));
        const t2 = draftArticle(ids.article(), articleContent(), at(2));
        const t3 = draftArticle(ids.article(), articleContent(), at(3));
        await insertArticles(h, t2, t1, t3);
        expect(idsOf(await articlePage(h, null))).toEqual([
          t3.id,
          t2.id,
          t1.id,
        ]);
      });

      it("articleRepository#22 読みものが2件。updatedAt が同じ / 読む", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const first = draftArticle(ids.article(), articleContent(), at(1));
        const second = draftArticle(ids.article(), articleContent(), at(1));
        await insertArticles(h, second, first);
        expect(idsOf(await articlePage(h, null))).toEqual([
          first.id,
          second.id,
        ]);
      });

      it("articleRepository#23 最も古い updatedAt の読みもの / revise の結果を save してから読む", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const oldest = draftArticle(ids.article(), articleContent(), at(1));
        const newer = draftArticle(ids.article(), articleContent(), at(2));
        await insertArticles(h, oldest, newer);
        await updateArticle(
          h,
          oldest.id,
          (article) =>
            Article.revise(article, articleContent({ title: "改稿" }), at(3))
              .entity,
        );
        expect(idsOf(await articlePage(h, null))).toEqual([
          oldest.id,
          newer.id,
        ]);
      });

      it('articleRepository#24 下書きの読みもの / publish の結果を save してから、status: "draft" と status: "published" で読む', async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const a = draftArticle(
          ids.article(),
          articleContent({ photoIds: [ids.photo()] }),
        );
        await insertArticles(h, a);
        await updateArticle(h, a.id, (article) =>
          Article.publish(article, at(1)),
        );
        expect(await articlePage(h, "draft")).toEqual({ items: [], count: 0 });
        expect(idsOf(await articlePage(h, "published"))).toEqual([a.id]);
      });

      it("articleRepository#25 読みものが0件 / page: 1, limit: 10 で読む", async () => {
        const h = await makeHarness();
        expect(await articlePage(h, null, { page: 1, limit: 10 })).toEqual({
          items: [],
          count: 0,
        });
      });

      it("articleRepository#26 読みものが1件 / page: 1, limit: 10 で読む", async () => {
        const h = await makeHarness();
        const a = draftArticle(articleIds().article());
        await insertArticles(h, a);
        expect(await articlePage(h, null, { page: 1, limit: 10 })).toEqual({
          items: [a],
          count: 1,
        });
      });

      /** `n` drafts, the i-th updated at minute i (so the last is the newest). */
      async function drafts(
        h: Awaited<ReturnType<HarnessFactory>>,
        n: number,
        ids = articleIds(),
      ): Promise<readonly ArticleId[]> {
        const articles = Array.from({ length: n }, (_, i) =>
          draftArticle(ids.article(), articleContent(), at(i + 1)),
        );
        await insertArticles(h, ...articles);
        return articles.map((article) => article.id).reverse();
      }

      it("articleRepository#27 読みものが10件 / page: 1, limit: 10 で読む", async () => {
        const h = await makeHarness();
        const newestFirst = await drafts(h, 10);
        const page = await articlePage(h, null, { page: 1, limit: 10 });
        expect(idsOf(page)).toEqual(newestFirst);
        expect(page.count).toBe(10);
      });

      it("articleRepository#28 読みものが10件 / page: 2, limit: 10 で読む", async () => {
        const h = await makeHarness();
        await drafts(h, 10);
        expect(await articlePage(h, null, { page: 2, limit: 10 })).toEqual({
          items: [],
          count: 10,
        });
      });

      it("articleRepository#29 読みものが11件 / page: 1, limit: 10 と page: 2, limit: 10 で読む", async () => {
        const h = await makeHarness();
        const newestFirst = await drafts(h, 11);
        const first = await articlePage(h, null, { page: 1, limit: 10 });
        const second = await articlePage(h, null, { page: 2, limit: 10 });
        expect(idsOf(first)).toEqual(newestFirst.slice(0, 10));
        expect(idsOf(second)).toEqual(newestFirst.slice(10));
        expect(first.count).toBe(11);
        expect(second.count).toBe(11);
      });

      it('articleRepository#30 下書きが11件、公開中が2件 / status: "published"、page: 1, limit: 10 で読む', async () => {
        const h = await makeHarness();
        const ids = articleIds();
        await drafts(h, 11, ids);
        const published = [
          publishedArticle(
            ids.article(),
            articleContent({ photoIds: [ids.photo()] }),
            at(20),
          ),
          publishedArticle(
            ids.article(),
            articleContent({ photoIds: [ids.photo()] }),
            at(21),
          ),
        ];
        await insertArticles(h, ...published);
        const page = await articlePage(h, "published", { page: 1, limit: 10 });
        expect(page.items).toHaveLength(2);
        expect(page.count).toBe(2);
      });
    });

    describe("findPublishedByShowcases", () => {
      const showing = (
        id: ArticleId,
        showcases: readonly ShowcaseRef[],
        photo: ReturnType<ReturnType<typeof articleIds>["photo"]>,
        now: Date = ARTICLE_T0,
      ) =>
        publishedArticle(
          id,
          articleContent({ photoIds: [photo], showcases }),
          now,
        );

      it("articleRepository#31 掲載 L を紹介先に持つ公開中の読みもの X。店舗 P を紹介先に持つ公開中の読みもの Y / L だけを渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const [L, P] = [ids.listing(), ids.place()];
        const x = showing(ids.article(), [L], ids.photo());
        const y = showing(ids.article(), [P], ids.photo());
        await insertArticles(h, x, y);
        expect(await articlesShowcasing(h, [L])).toEqual({
          items: [x],
          count: 1,
        });
      });

      it("articleRepository#32 上と同じ / L と P を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const [L, P] = [ids.listing(), ids.place()];
        const x = showing(ids.article(), [L], ids.photo());
        const y = showing(ids.article(), [P], ids.photo());
        await insertArticles(h, x, y);
        const page = await articlesShowcasing(h, [L, P]);
        expect(idsOf(page).sort()).toEqual([x.id, y.id].sort());
        expect(page.count).toBe(2);
      });

      it("articleRepository#33 掲載 L と店舗 P の両方を紹介先に持つ公開中の読みもの X / L と P を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const [L, P] = [ids.listing(), ids.place()];
        const x = showing(ids.article(), [L, P], ids.photo());
        await insertArticles(h, x);
        expect(await articlesShowcasing(h, [L, P])).toEqual({
          items: [x],
          count: 1,
        });
      });

      it("articleRepository#34 掲載 L を紹介先に持つ、下書き・公開中・公開の取り下げの読みものが1件ずつ / L を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const L = ids.listing();
        const content = () =>
          articleContent({ photoIds: [ids.photo()], showcases: [L] });
        const draft = draftArticle(ids.article(), content());
        const published = publishedArticle(ids.article(), content());
        const unpublished = unpublishedArticle(ids.article(), content());
        await insertArticles(h, draft, published, unpublished);
        expect(await articlesShowcasing(h, [L])).toEqual({
          items: [published],
          count: 1,
        });
      });

      it("articleRepository#35 ID x の掲載を紹介先に持つ公開中の読みもの / ID x の店舗を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const L = ids.listing();
        await insertArticles(h, showing(ids.article(), [L], ids.photo()));
        const samePlaceId: ShowcaseRef = {
          kind: "place",
          id: PlaceId.create(L.id),
        };
        expect(await articlesShowcasing(h, [samePlaceId])).toEqual({
          items: [],
          count: 0,
        });
      });

      it("articleRepository#36 地域とイベントを紹介先に持つ公開中の読みもの / その地域を渡す。別に、そのイベントを渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const [R, O] = [ids.region(), ids.occasion()];
        const a = showing(ids.article(), [R, O], ids.photo());
        await insertArticles(h, a);
        expect(idsOf(await articlesShowcasing(h, [R]))).toEqual([a.id]);
        expect(idsOf(await articlesShowcasing(h, [O]))).toEqual([a.id]);
      });

      it("articleRepository#37 どの読みものも紹介していない対象 / その対象を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        await insertArticles(
          h,
          showing(ids.article(), [ids.listing()], ids.photo()),
        );
        expect(await articlesShowcasing(h, [ids.place()])).toEqual({
          items: [],
          count: 0,
        });
      });

      it("articleRepository#38 L を紹介する公開中の読みものが3件。firstPublishedAt は T1 < T2 < T3 / L を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const L = ids.listing();
        const t1 = showing(ids.article(), [L], ids.photo(), at(1));
        const t2 = showing(ids.article(), [L], ids.photo(), at(2));
        const t3 = showing(ids.article(), [L], ids.photo(), at(3));
        await insertArticles(h, t2, t3, t1);
        expect(idsOf(await articlesShowcasing(h, [L]))).toEqual([
          t3.id,
          t2.id,
          t1.id,
        ]);
      });

      it("articleRepository#39 T1 に公開し、取り下げ、T4 に再び公開した読みものと、T2 に公開した読みもの。どちらも L を紹介する / L を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const L = ids.listing();
        const republished = Article.publish(
          Article.unpublish(
            showing(ids.article(), [L], ids.photo(), at(1)),
            at(3),
          ),
          at(4),
        );
        const t2 = showing(ids.article(), [L], ids.photo(), at(2));
        await insertArticles(h, republished, t2);
        const page = await articlesShowcasing(h, [L]);
        expect(idsOf(page)).toEqual([t2.id, republished.id]);
        expect(page.items[1]?.publication.firstPublishedAt).toEqual(at(1));
      });

      it("articleRepository#40 L を紹介する公開中の読みものが2件。firstPublishedAt が同じ / L を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const L = ids.listing();
        const first = showing(ids.article(), [L], ids.photo(), at(1));
        const second = showing(ids.article(), [L], ids.photo(), at(1));
        await insertArticles(h, second, first);
        expect(idsOf(await articlesShowcasing(h, [L]))).toEqual([
          first.id,
          second.id,
        ]);
      });

      it("articleRepository#41 L を紹介する公開中の読みもの / unpublish の結果を save してから、L を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const L = ids.listing();
        const a = showing(ids.article(), [L], ids.photo());
        await insertArticles(h, a);
        await updateArticle(h, a.id, (article) =>
          Article.unpublish(article, at(1)),
        );
        expect(await articlesShowcasing(h, [L])).toEqual({
          items: [],
          count: 0,
        });
      });

      it("articleRepository#42 L を紹介する公開中の読みもの / L を紹介先から外す revise の結果を save してから、L を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const [L, P] = [ids.listing(), ids.place()];
        const photo = ids.photo();
        const a = showing(ids.article(), [L, P], photo);
        await insertArticles(h, a);
        await updateArticle(
          h,
          a.id,
          (article) =>
            Article.revise(
              article,
              articleContent({ photoIds: [photo], showcases: [P] }),
              at(1),
            ).entity,
        );
        expect(await articlesShowcasing(h, [L])).toEqual({
          items: [],
          count: 0,
        });
        expect(idsOf(await articlesShowcasing(h, [P]))).toEqual([a.id]);
      });

      it("articleRepository#43 公開中の読みもの / L を紹介先に加える revise の結果を save してから、L を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const L = ids.listing();
        const photo = ids.photo();
        const a = showing(ids.article(), [], photo);
        await insertArticles(h, a);
        const saved = await updateArticle(
          h,
          a.id,
          (article) =>
            Article.revise(
              article,
              articleContent({ photoIds: [photo], showcases: [L] }),
              at(1),
            ).entity,
        );
        expect(await articlesShowcasing(h, [L])).toEqual({
          items: [saved],
          count: 1,
        });
      });

      it("articleRepository#44 公開中の読みものがある / 空の refs を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        await insertArticles(
          h,
          showing(ids.article(), [ids.listing()], ids.photo()),
        );
        expect(await articlesShowcasing(h, [])).toEqual({
          items: [],
          count: 0,
        });
      });

      it("articleRepository#45 101個の対象のうち、最後の1つだけを紹介する公開中の読みもの / 101個を渡す", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const targets = Array.from({ length: 101 }, () => ids.listing());
        const last = targets[100];
        if (last === undefined) throw new Error("101 targets");
        const a = showing(ids.article(), [last], ids.photo());
        await insertArticles(h, a);
        expect(await articlesShowcasing(h, targets)).toEqual({
          items: [a],
          count: 1,
        });
      });

      /** `n` published articles showcasing `L`, the i-th published at minute i. */
      async function showcasing(
        h: Awaited<ReturnType<HarnessFactory>>,
        n: number,
      ) {
        const ids = articleIds();
        const L = ids.listing();
        const articles = Array.from({ length: n }, (_, i) =>
          showing(ids.article(), [L], ids.photo(), at(i + 1)),
        );
        await insertArticles(h, ...articles);
        return { L, newestFirst: articles.map((a) => a.id).reverse() };
      }

      it("articleRepository#46 L を紹介する公開中の読みものが1件 / L を渡し、page: 1, limit: 10 で読む", async () => {
        const h = await makeHarness();
        const { L, newestFirst } = await showcasing(h, 1);
        const page = await articlesShowcasing(h, [L], { page: 1, limit: 10 });
        expect(idsOf(page)).toEqual(newestFirst);
        expect(page.count).toBe(1);
      });

      it("articleRepository#47 L を紹介する公開中の読みものが10件 / L を渡し、page: 1, limit: 10 で読む", async () => {
        const h = await makeHarness();
        const { L, newestFirst } = await showcasing(h, 10);
        const page = await articlesShowcasing(h, [L], { page: 1, limit: 10 });
        expect(idsOf(page)).toEqual(newestFirst);
        expect(page.count).toBe(10);
      });

      it("articleRepository#48 L を紹介する公開中の読みものが10件 / L を渡し、page: 2, limit: 10 で読む", async () => {
        const h = await makeHarness();
        const { L } = await showcasing(h, 10);
        expect(
          await articlesShowcasing(h, [L], { page: 2, limit: 10 }),
        ).toEqual({ items: [], count: 10 });
      });

      it("articleRepository#49 L を紹介する公開中の読みものが11件 / L を渡し、page: 1, limit: 10 と page: 2, limit: 10 で読む", async () => {
        const h = await makeHarness();
        const { L, newestFirst } = await showcasing(h, 11);
        const first = await articlesShowcasing(h, [L], { page: 1, limit: 10 });
        const second = await articlesShowcasing(h, [L], {
          page: 2,
          limit: 10,
        });
        expect(idsOf(first)).toEqual(newestFirst.slice(0, 10));
        expect(idsOf(second)).toEqual(newestFirst.slice(10));
        expect(first.count).toBe(11);
        expect(second.count).toBe(11);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("articleRepository#50 UnitOfWork の中で読みものを insert し、コミットした / コミットの直後に findById・findPage で読む", async () => {
        const h = await makeHarness();
        const a = draftArticle(articleIds().article());
        await insertArticles(h, a);
        expect((await getArticle(h, a.id)).entity).toEqual(a);
        expect(await articlePage(h, null)).toEqual({ items: [a], count: 1 });
      });

      it("articleRepository#51 UnitOfWork の中で publish の結果を save し、コミットした / コミットの直後に findPublishedByShowcases で読む", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const L = ids.listing();
        const a = draftArticle(
          ids.article(),
          articleContent({ photoIds: [ids.photo()], showcases: [L] }),
        );
        await insertArticles(h, a);
        const published = await updateArticle(h, a.id, (article) =>
          Article.publish(article, at(1)),
        );
        expect(await articlesShowcasing(h, [L])).toEqual({
          items: [published],
          count: 1,
        });
      });

      it("articleRepository#52 読みものがない / UnitOfWork の中で読みものを insert し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const a = draftArticle(articleIds().article());
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ articleRepository }) => {
            await articleRepository.insert(a);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await findArticle(h, a.id)).toBeNull();
        expect(await articlePage(h, null)).toEqual({ items: [], count: 0 });
      });

      it("articleRepository#53 下書きの読みもの / UnitOfWork の中で publish の結果を save し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const a = draftArticle(
          ids.article(),
          articleContent({ photoIds: [ids.photo()] }),
        );
        await insertArticles(h, a);
        const read = await getArticle(h, a.id);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ articleRepository }) => {
            await articleRepository.save(
              Article.publish(read.entity, at(1)),
              read.expectedVersion,
            );
            throw abort;
          }),
        ).rejects.toBe(abort);
        const after = await getArticle(h, a.id);
        expect(after.entity).toEqual(a);
        expect(after.expectedVersion).toBe(read.expectedVersion);
      });

      it("articleRepository#54 写真を持つ読みもの / UnitOfWork の中で takeDownPhotos の結果を save し、下書きを collectEvents に渡し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const ids = articleIds();
        const photo = ids.photo();
        const a = publishedArticle(
          ids.article(),
          articleContent({ photoIds: [photo, ids.photo()] }),
        );
        await insertArticles(h, a);
        const read = await getArticle(h, a.id);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ articleRepository, collectEvents }) => {
            const { entity, eventDrafts } = Article.takeDownPhotos(
              read.entity,
              [photo],
              at(1),
            );
            await articleRepository.save(entity, read.expectedVersion);
            collectEvents(eventDrafts);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect((await getArticle(h, a.id)).entity).toEqual(a);
        expect(await h.savedEvents()).toEqual([]);
      });
    });
  });
}
