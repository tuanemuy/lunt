import { PERIODS } from "@repo/core/adapters/do/__conformance__/discoveryFixtures";
import type { Article } from "@repo/core/domain/article/article";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import { Listing } from "@repo/core/domain/listing/listing";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { articleKit, content } from "./kit";

const photoIdsOf = (article: Article) =>
  article.content.photos.items.map((photo) => photo.photoId);

describe("getArticleForEditing", () => {
  it("getArticleForEditing#1 写真2枚と、閲覧できる掲載・店舗・地域・イベントを紹介先に持つ下書き / 編集担当者が読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const { refs } = await k.viewableTargets();
    const photoIds = await k.photos(E, 2);
    const showcases = [refs.occasion, refs.listing, refs.region, refs.place];
    const draft = await k.article({ photoIds, showcases }, "draft", E);
    const read = await k.get(E, draft.id);
    expect(read.article).toEqual(draft);
    expect(read.article.version).toBe(draft.version);
    expect(read.article.publication).toEqual({ status: "draft" });
    expect(photoIdsOf(read.article)).toEqual(photoIds);
    for (const photoId of photoIds) {
      expect(read.photos[photoId]).toBeDefined();
    }
    expect(read.showcases.map((s) => s.ref)).toEqual(showcases);
    expect(read.showcases.every((s) => s.viewable)).toBe(true);
    expect(
      read.showcases.map((s) => (s.viewable ? s.showcase.kind : null)),
    ).toEqual(["occasion", "listing", "region", "place"]);
    expect(read.photosTakenDown).toBe(false);
  });

  it("getArticleForEditing#2 別の編集担当者が作成した読みもの / 読む", async () => {
    const k = articleKit();
    const A = await k.editor("a");
    const B = await k.editor("b");
    const article = await k.article({}, "draft", A);
    expect((await k.get(B, article.id)).article).toEqual(article);
  });

  it("getArticleForEditing#3 紹介先の掲載が、運営によって非公開になった公開中の読みもの / 読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const { listing, refs } = await k.viewableTargets();
    const article = await k.article(
      { showcases: [refs.listing, refs.place] },
      "published",
      E,
    );
    await k.world.updateListing(
      listing,
      (stored) => Listing.suspend(stored, k.tick()).entity,
    );
    const read = await k.get(E, article.id);
    expect(read.showcases[0]).toEqual({
      ref: refs.listing,
      viewable: false,
      stored: { exists: true, name: listing.content.name },
    });
    expect(read.showcases[1]?.viewable).toBe(true);
    expect(read.article.content.showcases).toEqual([refs.listing, refs.place]);
    expect(read.article.publication.status).toBe("published");
  });

  it("getArticleForEditing#4 紹介先の掲載が削除された読みもの / 読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const { listing, refs } = await k.viewableTargets();
    const article = await k.article({ showcases: [refs.listing] }, "draft", E);
    await k.world.deleteListing(listing);
    expect((await k.get(E, article.id)).showcases).toEqual([
      { ref: refs.listing, viewable: false, stored: { exists: false } },
    ]);
  });

  it("getArticleForEditing#5 紹介先の地域の公開が取り下げられ、その後に再び公開された読みもの / 読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const { region, refs } = await k.viewableTargets();
    const article = await k.article({ showcases: [refs.region] }, "draft", E);
    await k.world.updateRegion(
      region,
      (stored) => Region.unpublish(stored, k.tick()).entity,
    );
    expect((await k.get(E, article.id)).showcases[0]?.viewable).toBe(false);
    await k.world.updateRegion(
      region,
      (stored) => Region.publish(stored, k.tick()).entity,
    );
    const [showcase] = (await k.get(E, article.id)).showcases;
    expect(showcase?.viewable).toBe(true);
  });

  it("getArticleForEditing#6 紹介先に、提供終了の掲載、閉店した店舗、終了したイベント、中止したイベントを持つ読みもの / 読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const open = await k.world.place();
    const ended = await k.world.endedBySchedule(open.id);
    const closed = await k.world.place({ status: "permanentlyClosed" });
    const over = await k.world.occasion({ period: PERIODS.ended });
    const cancelled = await k.world.occasion({ state: "cancelled" });
    const showcases: ShowcaseRef[] = [
      { kind: "listing", id: ended.id },
      { kind: "place", id: closed.id },
      { kind: "occasion", id: over.id },
      { kind: "occasion", id: cancelled.id },
    ];
    const article = await k.article({ showcases }, "draft", E);
    const read = await k.get(E, article.id);
    const standings = read.showcases.map((s) => {
      if (!s.viewable) return null;
      switch (s.showcase.kind) {
        case "listing":
          return s.showcase.summary.standing.offering.phase;
        case "place":
          return s.showcase.summary.standing.operating;
        case "occasion":
          return s.showcase.summary.standing.holding;
        default:
          return s.showcase.kind;
      }
    });
    expect(standings).toEqual([
      "ended",
      "permanentlyClosed",
      "ended",
      "cancelled",
    ]);
  });

  it("getArticleForEditing#7 申立てによる写真の削除で公開が取り下げられた読みもの / 読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [A] = await k.photos(E, 1);
    if (A === undefined) throw new Error("a photo");
    const published = await k.article({ photoIds: [A] }, "published", E);
    await k.takeDown(published.id, [A]);
    const read = await k.get(E, published.id);
    expect(read.article.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
    expect(read.photosTakenDown).toBe(true);
    expect(photoIdsOf(read.article)).toEqual([]);
  });

  it("getArticleForEditing#8 写真 A・B を持つ公開中の読みもの。申立てに基づいて A が削除され、公開は続いている / 読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const photoIds = await k.photos(E, 2);
    const [A, B] = photoIds;
    if (A === undefined || B === undefined) throw new Error("two photos");
    const published = await k.article({ photoIds }, "published", E);
    await k.takeDown(published.id, [A]);
    const read = await k.get(E, published.id);
    expect(read.article.publication.status).toBe("published");
    expect(read.photosTakenDown).toBe(true);
    expect(photoIdsOf(read.article)).toEqual([B]);
  });

  it("getArticleForEditing#9 写真 A だけを持つ下書きの読みもの。申立てに基づいて A が削除された / 読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [A] = await k.photos(E, 1);
    if (A === undefined) throw new Error("a photo");
    const draft = await k.article({ photoIds: [A] }, "draft", E);
    await k.takeDown(draft.id, [A]);
    const read = await k.get(E, draft.id);
    expect(read.article.publication).toEqual({ status: "draft" });
    expect(read.photosTakenDown).toBe(true);
  });

  it("getArticleForEditing#10 申立てに基づいて写真が削除された後、編集担当者が写真を加えて reviseArticle で保存した読みもの / 読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const photoIds = await k.photos(E, 2);
    const [A, B] = photoIds;
    if (A === undefined || B === undefined) throw new Error("two photos");
    const published = await k.article({ photoIds }, "published", E);
    const takenDown = await k.takeDown(published.id, [A]);
    const [C] = await k.photos(E, 1);
    if (C === undefined) throw new Error("a photo");
    await k.revise(E, takenDown, content({ photoIds: [B, C] }));
    expect((await k.get(E, published.id)).photosTakenDown).toBe(false);
  });

  it("getArticleForEditing#11 申立てに基づいて写真が削除された後、編集担当者が本文だけを書き換えて保存した読みもの / 読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const photoIds = await k.photos(E, 2);
    const [A, B] = photoIds;
    if (A === undefined || B === undefined) throw new Error("two photos");
    const published = await k.article({ photoIds }, "published", E);
    const takenDown = await k.takeDown(published.id, [A]);
    await k.revise(E, takenDown, content({ body: "本文だけ", photoIds: [B] }));
    const read = await k.get(E, published.id);
    expect(read.article.content.body).toBe("本文だけ");
    expect(read.photosTakenDown).toBe(true);
  });

  it("getArticleForEditing#12 読んだ読みもの / 返された版で reviseArticle を実行する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const article = await k.article({}, "draft", E);
    const read = await k.get(E, article.id);
    const { article: saved } = await k.revise(
      E,
      read.article,
      content({ body: "読んだ版で保存" }),
    );
    expect(saved.version).toBe(read.article.version + 1);
  });

  it("getArticleForEditing#13 編集担当者の役割を持たない利用者 / 読む", async () => {
    const k = articleKit();
    const U = await k.person("user");
    const article = await k.article();
    await expectCode(k.get(U, article.id), ForbiddenError);
  });
});
