import { describe, expect, it } from "vitest";
import { listArticles } from "../listArticles";
import { type DiscoveryKit, discoveryKit } from "./kit";

const list = (k: DiscoveryKit, pagination = { page: 1, limit: 10 }) =>
  listArticles({ container: k.container, input: { pagination } });

type Out = Awaited<ReturnType<typeof list>>;

const idsOf = (out: Out) => out.items.map((item) => item.articleId);

describe("listArticles", () => {
  it("listArticles#1 公開中の読みもの A1・A2・A3 が、この順に最初に公開された / 読む", async () => {
    const k = await discoveryKit();
    const A1 = await k.w.article({ title: "一" });
    const A2 = await k.w.article({ title: "二" });
    const A3 = await k.w.article({ title: "三", photos: 2 });
    const out = await list(k);
    expect(idsOf(out)).toEqual([A3.id, A2.id, A1.id]);
    expect(out.count).toBe(3);
    const [cover] = A3.content.photos.items;
    if (cover === undefined) throw new Error("a photo");
    expect(out.items[0]).toEqual({
      articleId: A3.id,
      cover: { source: "own", photoId: cover.photoId, framing: null },
      title: "三",
    });
    for (const item of out.items) {
      expect(out.photos[item.cover.photoId]).toBeDefined();
    }
  });

  it("listArticles#2 A1 が公開を取り下げられた後、再び公開された / 読む", async () => {
    const k = await discoveryKit();
    const A1 = await k.w.article();
    const A2 = await k.w.article();
    const A3 = await k.w.article();
    await k.w.unpublishArticle(A1);
    await k.w.publishArticle(A1);
    expect(idsOf(await list(k))).toEqual([A3.id, A2.id, A1.id]);
  });

  it("listArticles#3 下書きの読みものと、公開を取り下げた読みものがある / 読む", async () => {
    const k = await discoveryKit();
    const shown = await k.w.article();
    await k.w.article({ state: "draft" });
    await k.w.article({ state: "unpublished" });
    const out = await list(k);
    expect(idsOf(out)).toEqual([shown.id]);
    expect(out.count).toBe(1);
  });

  it("listArticles#4 公開中の読みものが、1ページの件数より多い / 1ページ目と2ページ目を読む", async () => {
    const k = await discoveryKit();
    const made: string[] = [];
    for (let i = 0; i < 5; i += 1) made.push((await k.w.article()).id);
    const first = await list(k, { page: 1, limit: 3 });
    const second = await list(k, { page: 2, limit: 3 });
    expect([...idsOf(first), ...idsOf(second)]).toEqual(made.reverse());
    expect([first.count, second.count]).toEqual([5, 5]);
  });

  it("listArticles#5 公開中の読みものがない / 読む", async () => {
    const k = await discoveryKit();
    await k.w.article({ state: "draft" });
    expect(await list(k)).toEqual({ items: [], count: 0, photos: {} });
  });
});
