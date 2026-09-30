import { PERIODS } from "@repo/core/adapters/do/__conformance__/discoveryFixtures";
import { ArticleId } from "@repo/core/domain/common/ids";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import type { ShowcaseSummary } from "@repo/core/domain/discovery/viewProjection";
import { Listing } from "@repo/core/domain/listing/listing";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import { ARTICLE_NOT_FOUND, readArticle } from "../readArticle";
import { type DiscoveryKit, discoveryKit, expectNotFound } from "./kit";

const read = (k: DiscoveryKit, articleId: ArticleId) =>
  readArticle({ container: k.container, input: { articleId } });

/** A showcase as `kind:id`, for order checks. */
function labelOf(showcase: ShowcaseSummary): string {
  switch (showcase.kind) {
    case "listing":
      return `listing:${showcase.summary.listingId}`;
    case "place":
      return `place:${showcase.summary.placeId}`;
    case "region":
      return `region:${showcase.summary.regionId}`;
    case "occasion":
      return `occasion:${showcase.summary.occasionId}`;
  }
}

const labels = (out: Awaited<ReturnType<typeof read>>) =>
  out.article.showcases.map(labelOf);

const labelOfRef = (ref: ShowcaseRef) => `${ref.kind}:${ref.id}`;

/** A viewable place with one available listing, a region and an occasion. */
async function targets(k: DiscoveryKit) {
  const P = await k.w.place({ profile: { name: "山田珈琲店" } });
  const L = await k.w.available(P.id);
  const R = await k.w.region({ name: "谷中" });
  const E = await k.w.occasion({ name: "朝市" });
  const refs = {
    P: { kind: "place", id: P.id },
    L: { kind: "listing", id: L.id },
    R: { kind: "region", id: R.id },
    E: { kind: "occasion", id: E.id },
  } as const satisfies Record<string, ShowcaseRef>;
  return { P, L, R, E, refs };
}

describe("readArticle", () => {
  it("readArticle#1 公開中の読みもの A が、イベント E、掲載 L、地域 R、店舗 P をこの順に紹介先に持つ。すべて閲覧できる / A を読む", async () => {
    const k = await discoveryKit();
    const { P, L, R, E, refs } = await targets(k);
    const A = await k.w.article({
      title: "路地の話",
      body: "谷中を歩く。\n朝市へ。",
      photos: 3,
      showcases: [refs.E, refs.L, refs.R, refs.P],
    });
    const out = await read(k, A.id);
    expect(out.article).toMatchObject({
      articleId: A.id,
      title: "路地の話",
      body: "谷中を歩く。\n朝市へ。",
      photos: A.content.photos.items,
    });
    expect(labels(out)).toEqual(
      [refs.E, refs.L, refs.R, refs.P].map(labelOfRef),
    );
    expect(out.article.showcases).toMatchObject([
      {
        kind: "occasion",
        summary: {
          occasionId: E.id,
          name: "朝市",
          standing: { kind: "occasion", holding: "upcoming" },
        },
      },
      {
        kind: "listing",
        summary: {
          listingId: L.id,
          placeId: P.id,
          placeName: "山田珈琲店",
          standing: { kind: "listing", offering: { phase: "available" } },
        },
      },
      { kind: "region", summary: { regionId: R.id, name: "谷中" } },
      {
        kind: "place",
        summary: { placeId: P.id, name: "山田珈琲店" },
      },
    ]);
    for (const photo of A.content.photos.items) {
      expect(out.photos[photo.photoId]).toBeDefined();
    }
    const [listingPhoto] = L.content.photos.items;
    const [regionPhoto] = R.content.photos.items;
    const [occasionPhoto] = E.content.photos.items;
    for (const photo of [listingPhoto, regionPhoto, occasionPhoto]) {
      if (photo === undefined) throw new Error("a photo");
      expect(out.photos[photo.photoId]).toBeDefined();
    }
  });

  it("readArticle#2 紹介先に、提供終了の掲載、閉店した店舗、終了したイベントがある / A を読む", async () => {
    const k = await discoveryKit();
    const host = await k.w.place();
    const ended = await k.w.endedBySchedule(host.id);
    const closed = await k.w.place({ status: "permanentlyClosed" });
    const over = await k.w.occasion({ period: PERIODS.ended });
    const A = await k.w.article({
      showcases: [
        { kind: "listing", id: ended.id },
        { kind: "place", id: closed.id },
        { kind: "occasion", id: over.id },
      ],
    });
    const out = await read(k, A.id);
    expect(out.article.showcases).toMatchObject([
      {
        kind: "listing",
        summary: {
          listingId: ended.id,
          standing: { offering: { phase: "ended" } },
        },
      },
      {
        kind: "place",
        summary: {
          placeId: closed.id,
          standing: { operating: "permanentlyClosed" },
        },
      },
      {
        kind: "occasion",
        summary: { occasionId: over.id, standing: { holding: "ended" } },
      },
    ]);
  });

  it("readArticle#3 紹介先の掲載 L が一時非公開に、地域 R が公開の取り下げになった / A を読む", async () => {
    const k = await discoveryKit();
    const { L, R, refs } = await targets(k);
    const A = await k.w.article({
      body: "本文はそのまま",
      showcases: [refs.E, refs.L, refs.R, refs.P],
    });
    await k.w.updateListing(
      L,
      (stored) => Listing.unpublish(stored, k.w.f.tick()).entity,
    );
    await k.w.updateRegion(
      R,
      (stored) => Region.unpublish(stored, k.w.f.tick()).entity,
    );
    const out = await read(k, A.id);
    expect(out.article.body).toBe("本文はそのまま");
    expect(labels(out)).toEqual([refs.E, refs.P].map(labelOfRef));
  });

  it("readArticle#4 紹介先の店舗 P が非公開になった。紹介先には P の掲載 L もある / A を読む", async () => {
    const k = await discoveryKit();
    const { P, refs } = await targets(k);
    const A = await k.w.article({ showcases: [refs.P, refs.L, refs.R] });
    await k.w.suspendPlace(P);
    const out = await read(k, A.id);
    expect(labels(out)).toEqual([refs.R].map(labelOfRef));
  });

  it("readArticle#5 紹介先の掲載が削除された / A を読む", async () => {
    const k = await discoveryKit();
    const { L, refs } = await targets(k);
    const A = await k.w.article({ showcases: [refs.L, refs.E] });
    await k.w.deleteListing(L);
    const out = await read(k, A.id);
    expect(labels(out)).toEqual([refs.E].map(labelOfRef));
  });

  it("readArticle#6 紹介先が、どれも閲覧できない。または、紹介先を持たない / A を読む", async () => {
    const k = await discoveryKit();
    const hiddenPlace = await k.w.place({ suspended: true });
    const hiddenRegion = await k.w.region({ state: "unpublished" });
    const hidden = await k.w.article({
      title: "閉じた話",
      showcases: [
        { kind: "place", id: hiddenPlace.id },
        { kind: "region", id: hiddenRegion.id },
      ],
    });
    const bare = await k.w.article({ title: "紹介先なし" });
    for (const [A, title] of [
      [hidden, "閉じた話"],
      [bare, "紹介先なし"],
    ] as const) {
      const out = await read(k, A.id);
      expect(out.article).toMatchObject({ articleId: A.id, title });
      expect(out.article.showcases).toEqual([]);
    }
  });

  it("readArticle#7 読みものが、下書き、公開の取り下げのいずれか。または、その ID の読みものがない / その読みものを読む", async () => {
    const k = await discoveryKit();
    const ids = [
      (await k.w.article({ state: "draft" })).id,
      (await k.w.article({ state: "unpublished" })).id,
      ArticleId.create(k.idGenerator.next()),
    ];
    for (const id of ids) {
      await expectNotFound(read(k, id), ARTICLE_NOT_FOUND);
    }
  });

  it("resolves more than 100 showcases in batches, keeping the article's order", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const refs: ShowcaseRef[] = [];
    for (let i = 0; i < 101; i += 1) {
      refs.push({ kind: "listing", id: (await k.w.available(P.id)).id });
    }
    const R = await k.w.region();
    refs.push({ kind: "region", id: R.id });
    const A = await k.w.article({ showcases: [...refs].reverse() });
    const out = await read(k, A.id);
    expect(labels(out)).toEqual([...refs].reverse().map(labelOfRef));
  });
});
