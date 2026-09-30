import { ListingId } from "@repo/core/domain/common/ids";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import { listArticlesShowcasing } from "../listArticlesShowcasing";
import { LISTING_NOT_FOUND } from "../viewListing";
import { PLACE_NOT_FOUND } from "../viewPlace";
import { REGION_NOT_FOUND } from "../viewRegion";
import { type DiscoveryKit, discoveryKit, expectNotFound } from "./kit";

const list = (
  k: DiscoveryKit,
  target: ShowcaseRef,
  pagination = { page: 1, limit: 3 },
) =>
  listArticlesShowcasing({
    container: k.container,
    input: { target, pagination },
  });

type Out = Awaited<ReturnType<typeof list>>;

const idsOf = (out: Out) => out.items.map((item) => item.articleId);

describe("listArticlesShowcasing", () => {
  it("listArticlesShowcasing#1 店舗 P を紹介先に持つ公開中の読みものが5件ある / P を指定して、1ページ3件で1ページ目と2ページ目を読む（詳細の読みものの区分と、その続き）", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const ref: ShowcaseRef = { kind: "place", id: P.id };
    const made: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      made.push((await k.w.article({ showcases: [ref] })).id);
    }
    const newest = [...made].reverse();
    const first = await list(k, ref);
    const second = await list(k, ref, { page: 2, limit: 3 });
    expect(idsOf(first)).toEqual(newest.slice(0, 3));
    expect(idsOf(second)).toEqual(newest.slice(3));
    expect([first.count, second.count]).toEqual([5, 5]);
    for (const item of first.items) {
      expect(first.photos[item.cover.photoId]).toBeDefined();
    }
  });

  it("listArticlesShowcasing#2 掲載 L、地域 R、イベント E のそれぞれを紹介先に持つ公開中の読みものが4件ずつある / L、R、E をそれぞれ指定して、1ページ3件で1ページ目を読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const refs: readonly ShowcaseRef[] = [
      { kind: "listing", id: (await k.w.available(P.id)).id },
      { kind: "region", id: (await k.w.region()).id },
      { kind: "occasion", id: (await k.w.occasion()).id },
    ];
    const byRef = new Map<ShowcaseRef, string[]>();
    for (let i = 0; i < 4; i += 1) {
      for (const ref of refs) {
        const A = await k.w.article({ showcases: [ref] });
        byRef.set(ref, [...(byRef.get(ref) ?? []), A.id]);
      }
    }
    for (const ref of refs) {
      const read = await list(k, ref);
      expect(idsOf(read)).toEqual(
        [...(byRef.get(ref) ?? [])].reverse().slice(0, 3),
      );
      expect(read.count).toBe(4);
    }
  });

  it("listArticlesShowcasing#3 地域 R を紹介先に持つ公開中の読みものが4件、公開を取り下げた読みものが1件ある / R を指定して読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    const ref: ShowcaseRef = { kind: "region", id: R.id };
    const shown: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      shown.push((await k.w.article({ showcases: [ref] })).id);
    }
    await k.w.article({ state: "unpublished", showcases: [ref] });
    const read = await list(k, ref, { page: 1, limit: 10 });
    expect(idsOf(read)).toEqual([...shown].reverse());
    expect(read.count).toBe(4);
  });

  it("listArticlesShowcasing#4 店舗 P を紹介先に持つ読みものが、下書きと公開の取り下げだけ / P を指定して読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const ref: ShowcaseRef = { kind: "place", id: P.id };
    await k.w.article({ state: "draft", showcases: [ref] });
    await k.w.article({ state: "unpublished", showcases: [ref] });
    expect(await list(k, ref)).toEqual({ items: [], count: 0, photos: {} });
  });

  it("listArticlesShowcasing#5 店舗 P の掲載 L だけを紹介先に持つ公開中の読みものがある / P を指定して読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L = await k.w.available(P.id);
    await k.w.article({ showcases: [{ kind: "listing", id: L.id }] });
    expect(await list(k, { kind: "place", id: P.id })).toEqual({
      items: [],
      count: 0,
      photos: {},
    });
  });

  it("listArticlesShowcasing#6 店舗 P を紹介先に持つ公開中の読みものがある。P は非公開。別に、公開を取り下げた地域 R と、その ID の掲載がない掲載の参照 / P、R、その掲載をそれぞれ指定して読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place({ suspended: true });
    const R = await k.w.region({ state: "unpublished" });
    const missing = ListingId.create(k.idGenerator.next());
    await k.w.article({
      showcases: [
        { kind: "place", id: P.id },
        { kind: "region", id: R.id },
        { kind: "listing", id: missing },
      ],
    });
    await expectNotFound(list(k, { kind: "place", id: P.id }), PLACE_NOT_FOUND);
    await expectNotFound(
      list(k, { kind: "region", id: R.id }),
      REGION_NOT_FOUND,
    );
    await expectNotFound(
      list(k, { kind: "listing", id: missing }),
      LISTING_NOT_FOUND,
    );
  });
});
