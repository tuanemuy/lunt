import type { Article } from "@repo/core/domain/article/article";
import { EventId } from "@repo/core/domain/common/event";
import { PhotoId } from "@repo/core/domain/common/ids";
import type { PublishConditionUnmetError } from "@repo/core/domain/common/publication";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Listing } from "@repo/core/domain/listing/listing";
import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  type Person,
  rejection,
} from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { eventDecoders } from "../../events/registry";
import {
  discardReleased,
  discardReleasedPhotos,
} from "../../media/discardReleasedPhotos";
import { type ArticleKit, articleKit, content } from "./kit";

const released = (article: Article, photoIds: readonly PhotoId[]) => ({
  type: "photos.released",
  aggregateId: article.id,
  payload: { photoIds },
});

const photoIdsOf = (article: Article) =>
  article.content.photos.items.map((photo) => photo.photoId);

/** An editor E and an article with photos A・B of E's, in `state`. */
async function withPhotos(state: "draft" | "published" = "draft"): Promise<{
  k: ArticleKit;
  E: Person;
  A: PhotoId;
  B: PhotoId;
  article: Article;
}> {
  const k = articleKit();
  const E = await k.editor();
  const [A, B] = await k.photos(E, 2);
  if (A === undefined || B === undefined) throw new Error("two photos");
  const article = await k.article({ photoIds: [A, B] }, state, E);
  return { k, E, A, B, article };
}

async function expectUnchanged(
  k: ArticleKit,
  article: Article,
  attempt: Promise<unknown>,
  code?: string,
) {
  const mark = await k.mark();
  const error = await rejection(attempt);
  if (code !== undefined) {
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect((error as BusinessRuleError).code).toBe(code);
  }
  expect(await k.stored(article.id)).toEqual(article);
  expect(await k.since(mark)).toEqual([]);
  return error;
}

describe("reviseArticle", () => {
  it("reviseArticle#1 下書きの読みもの。編集担当者が読んだ版は最新 / タイトルと本文を書き換えて保存する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const draft = await k.article({}, "draft", E);
    k.clock.advance(60_000);
    const now = k.clock.now();
    const { article } = await k.revise(
      E,
      draft,
      content({ title: "新しいタイトル", body: "新しい本文" }),
    );
    expect(article.content).toMatchObject({
      title: "新しいタイトル",
      body: "新しい本文",
    });
    expect(article.version).toBe(draft.version + 1);
    expect(article.updatedAt).toEqual(now);
    expect(article.publication).toEqual({ status: "draft" });
    expect(await k.stored(draft.id)).toEqual(article);
  });

  it("reviseArticle#2 別の編集担当者が作成した下書き / 内容を書き換えて保存する", async () => {
    const k = articleKit();
    const A = await k.editor("a");
    const B = await k.editor("b");
    const draft = await k.article({}, "draft", A);
    const { article } = await k.revise(
      B,
      draft,
      content({ body: "Bが直した" }),
    );
    expect((await k.stored(draft.id)).content.body).toBe("Bが直した");
    expect(article.version).toBe(draft.version + 1);
  });

  it("reviseArticle#3 下書きの読みもの / タイトル・本文・写真をすべてなくして保存する", async () => {
    const { k, E, article: draft } = await withPhotos();
    const { article, missingRequirements } = await k.revise(E, draft, {
      title: "",
      body: " ",
      photoIds: [],
      showcases: [],
    });
    expect(article.content).toMatchObject({ title: null, body: null });
    expect(article.content.photos.items).toEqual([]);
    expect(article.publication.status).toBe("draft");
    expect(missingRequirements).toEqual(["title", "photos", "body"]);
  });

  it("reviseArticle#4 公開中の読みもの / 本文を書き換えて保存する", async () => {
    const { k, E, A, B, article: published } = await withPhotos("published");
    const { article } = await k.revise(
      E,
      published,
      content({ body: "書き換えた本文", photoIds: [A, B] }),
    );
    expect(article.publication).toEqual(published.publication);
    expect((await k.readPublic(published.id)).article.body).toBe(
      "書き換えた本文",
    );
  });

  it("reviseArticle#5 公開中の読みもの / タイトルをなくして保存する", async () => {
    const { k, E, A, B, article } = await withPhotos("published");
    const error = await expectUnchanged(
      k,
      article,
      k.revise(E, article, content({ title: "", photoIds: [A, B] })),
      "ARTICLE_PUBLISH_CONDITION_UNMET",
    );
    expect((error as PublishConditionUnmetError).missing).toEqual(["title"]);
  });

  it("reviseArticle#6 公開中の読みもの / すべての写真を外して保存する", async () => {
    const { k, E, article } = await withPhotos("published");
    const error = await expectUnchanged(
      k,
      article,
      k.revise(E, article, content({ photoIds: [] })),
      "ARTICLE_PUBLISH_CONDITION_UNMET",
    );
    expect((error as PublishConditionUnmetError).missing).toEqual(["photos"]);
  });

  /** #7's save: B・C in place of A・B. */
  async function replaceWithC() {
    const setup = await withPhotos();
    const { k, E, B, article } = setup;
    const [C] = await k.photos(E, 1);
    if (C === undefined) throw new Error("a photo");
    const mark = await k.mark();
    const saved = await k.revise(E, article, content({ photoIds: [B, C] }));
    return { ...setup, C, mark, saved: saved.article };
  }

  it("reviseArticle#7 写真 A・B を持つ読みもの。編集担当者が登録した持ち主のない写真 C / 写真を B・C の順にして保存する", async () => {
    const { k, A, B, C, mark, saved, article } = await replaceWithC();
    expect(photoIdsOf(saved)).toEqual([B, C]);
    expect(await k.ownerOf(C)).toEqual({ kind: "article", id: article.id });
    expect(await k.since(mark)).toEqual([
      expect.objectContaining(released(article, [A])),
    ]);
  });

  it("reviseArticle#8 上の保存の後 / discardReleasedPhotos が photos.released を消費する", async () => {
    const { k, A, B, mark } = await replaceWithC();
    const [released] = (await k.since(mark)).filter(
      (event) => event.type === "photos.released",
    );
    if (released === undefined) throw new Error("no photos.released");
    await discardReleasedPhotos.handle(
      k.container,
      eventDecoders["photos.released"](released.payload, {
        id: EventId.create(k.newArticleId()),
        occurredAt: released.occurredAt,
        aggregateId: released.aggregateId,
      }),
    );
    expect(await k.findPhoto(A)).toBeNull();
    await expectCode(
      k.container.photoStorage.copy(A, PhotoId.create(k.newArticleId())),
      NotFoundError,
    );
    expect(await k.findPhoto(B)).not.toBeNull();
    await k.container.photoStorage.copy(B, PhotoId.create(k.newArticleId()));
  });

  it("reviseArticle#9 写真 A・B を持つ読みもの / 写真を B・A の順に並び替えて保存する", async () => {
    const { k, E, A, B, article } = await withPhotos();
    const mark = await k.mark();
    const { article: saved } = await k.revise(
      E,
      article,
      content({ photoIds: [B, A] }),
    );
    expect(photoIdsOf(saved)).toEqual([B, A]);
    expect(await k.since(mark)).toEqual([]);
    const owner = { kind: "article", id: article.id };
    expect(await k.ownerOf(A)).toEqual(owner);
    expect(await k.ownerOf(B)).toEqual(owner);
  });

  it("reviseArticle#10 紹介先に掲載 L を持つ公開中の読みもの。閲覧できるイベント E がある / 紹介先を E・L の順にして保存する", async () => {
    const k = articleKit();
    const Ed = await k.editor();
    const { refs } = await k.viewableTargets();
    const article = await k.article(
      { showcases: [refs.listing] },
      "published",
      Ed,
    );
    const { article: saved } = await k.revise(
      Ed,
      article,
      content({
        photoIds: photoIdsOf(article),
        showcases: [refs.occasion, refs.listing],
      }),
    );
    expect(saved.content.showcases).toEqual([refs.occasion, refs.listing]);
    expect(await k.showcasing(refs.occasion)).toEqual([article.id]);
  });

  it("reviseArticle#11 紹介先に掲載 L と店舗 P を持つ公開中の読みもの / 紹介先から L を外して保存する", async () => {
    const k = articleKit();
    const Ed = await k.editor();
    const { refs } = await k.viewableTargets();
    const article = await k.article(
      { showcases: [refs.listing, refs.place] },
      "published",
      Ed,
    );
    expect(await k.showcasing(refs.listing)).toEqual([article.id]);
    const { article: saved } = await k.revise(
      Ed,
      article,
      content({ photoIds: photoIdsOf(article), showcases: [refs.place] }),
    );
    expect(saved.content.showcases).toEqual([refs.place]);
    expect(await k.showcasing(refs.listing)).toEqual([]);
    expect(await k.showcasing(refs.place)).toEqual([article.id]);
  });

  /** A published article showcasing listing L, then L suspended by the operator. */
  async function showcasingSuspended() {
    const k = articleKit();
    const Ed = await k.editor();
    const { listing, refs } = await k.viewableTargets();
    const article = await k.article(
      { showcases: [refs.listing] },
      "published",
      Ed,
    );
    await k.world.updateListing(
      listing,
      (stored) => Listing.suspend(stored, k.tick()).entity,
    );
    return { k, Ed, article, L: refs.listing };
  }

  it("reviseArticle#12 紹介先の掲載 L が、運営によって非公開になった公開中の読みもの / 紹介先を変えず、本文だけを書き換えて保存する", async () => {
    const { k, Ed, article, L } = await showcasingSuspended();
    const { article: saved } = await k.revise(
      Ed,
      article,
      content({
        body: "本文だけ直した",
        photoIds: photoIdsOf(article),
        showcases: [L],
      }),
    );
    expect(saved.content.showcases).toEqual([L]);
    expect(saved.publication.status).toBe("published");
    expect(await k.stored(article.id)).toEqual(saved);
  });

  it("reviseArticle#13 紹介先の掲載が非公開になった読みもの / 保存の操作をしない", async () => {
    const { k, article } = await showcasingSuspended();
    const stored = await k.stored(article.id);
    expect(stored).toEqual(article);
    expect(stored.content.body).toBe(article.content.body);
  });

  it("reviseArticle#14 読みもの / 同じ店舗を紹介先に2回入れて保存する", async () => {
    const k = articleKit();
    const Ed = await k.editor();
    const { refs } = await k.viewableTargets();
    const article = await k.article({}, "draft", Ed);
    await expectUnchanged(
      k,
      article,
      k.revise(Ed, article, content({ showcases: [refs.place, refs.place] })),
      "ARTICLE_INVALID_SHOWCASE_LIST",
    );
  });

  it("reviseArticle#15 写真 A を持つ読みもの / 写真を A・A の順にして保存する", async () => {
    const { k, E, A, article } = await withPhotos();
    await expectUnchanged(
      k,
      article,
      k.revise(E, article, content({ photoIds: [A, A] })),
      "ARTICLE_DUPLICATE_PHOTO",
    );
  });

  it("reviseArticle#16 読みもの / 保存されている内容と同じ内容で保存する", async () => {
    const { k, E, A, B, article } = await withPhotos("published");
    const mark = await k.mark();
    const { article: saved } = await k.revise(
      E,
      article,
      content({ photoIds: [A, B] }),
    );
    expect(saved).toEqual(article);
    expect(await k.stored(article.id)).toEqual(article);
    expect(await k.since(mark)).toEqual([]);
  });

  it("reviseArticle#17 編集担当者 A と B が同じ版の読みものを読んだ。B が先に保存した / A が、読んだ時点の版で保存する", async () => {
    const k = articleKit();
    const A = await k.editor("a");
    const B = await k.editor("b");
    const article = await k.article({}, "draft", A);
    const { article: byB } = await k.revise(
      B,
      article,
      content({ body: "Bの本文" }),
    );
    await expectCode(
      k.revise(A, article, content({ body: "Aの本文" })),
      ConflictError,
    );
    expect(await k.stored(article.id)).toEqual(byB);
  });

  it("reviseArticle#18 編集担当者が読みものを読んだ後、申立てによる写真の削除が確定した / 読んだ時点の版で保存する", async () => {
    const { k, E, A, B, article } = await withPhotos("published");
    const takenDown = await k.takeDown(article.id, [A]);
    await expectCode(
      k.revise(E, article, content({ title: "直した", photoIds: [A, B] })),
      ConflictError,
    );
    const stored = await k.stored(article.id);
    expect(stored).toEqual(takenDown);
    expect(photoIdsOf(stored)).toEqual([B]);
  });

  it("reviseArticle#19 申立てによる写真の削除で、公開が取り下げられた読みもの（事由は photoTakedown） / 写真を登録し、その写真を入れて保存する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [A] = await k.photos(E, 1);
    if (A === undefined) throw new Error("a photo");
    const published = await k.article({ photoIds: [A] }, "published", E);
    const takenDown = await k.takeDown(published.id, [A]);
    expect(takenDown.publication).toMatchObject({ reason: "photoTakedown" });
    const [C] = await k.photos(E, 1);
    if (C === undefined) throw new Error("a photo");
    const { article: saved } = await k.revise(
      E,
      takenDown,
      content({ photoIds: [C] }),
    );
    expect(await k.ownerOf(C)).toEqual({ kind: "article", id: published.id });
    expect(saved.publication).toEqual({
      status: "unpublished",
      firstPublishedAt:
        published.publication.status === "published"
          ? published.publication.firstPublishedAt
          : null,
      reason: "photoTakedown",
    });
    expect(await k.stored(published.id)).toEqual(saved);
  });

  it("reviseArticle#20 別の人が登録した、持ち主のない写真 / その写真を加えて保存する", async () => {
    const { k, E, A, B, article } = await withPhotos();
    const other = await k.person("other");
    const [X] = await k.photos(other, 1);
    if (X === undefined) throw new Error("a photo");
    await expectUnchanged(
      k,
      article,
      k.revise(E, article, content({ photoIds: [B, X] })),
      "MEDIA_PHOTO_NOT_REGISTRANT",
    );
    expect(await k.ownerOf(A)).toEqual({ kind: "article", id: article.id });
    expect(await k.ownerOf(X)).toBeNull();
  });

  it("reviseArticle#21 一度外して保存し、photos.released で削除された写真 / その写真をもう一度加えて保存する", async () => {
    const { k, E, A, B, article } = await withPhotos();
    const { article: withoutA } = await k.revise(
      E,
      article,
      content({ photoIds: [B] }),
    );
    await discardReleased(k.container, [A]);
    await expectUnchanged(
      k,
      withoutA,
      k.revise(E, withoutA, content({ photoIds: [B, A] })),
      "MEDIA_PHOTO_NOT_AVAILABLE",
    );
  });

  it("reviseArticle#22 編集している間に、編集担当者の任命を解かれた利用者 / 保存する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const article = await k.article({}, "draft", E);
    const racing = commitAfter(k.container, () => k.revokeHolder("editor", E));
    await expectCode(
      k.revise(E, article, content({ body: "反映されない" }), racing),
      ForbiddenError,
    );
    expect(await k.stored(article.id)).toEqual(article);
  });

  it("reviseArticle#23 読みもの / 改行を含むタイトルで保存する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const article = await k.article({}, "draft", E);
    await expectUnchanged(
      k,
      article,
      k.revise(E, article, content({ title: "一行目\n二行目" })),
      "ARTICLE_INVALID_TITLE",
    );
  });

  it("reviseArticle#24 自分が登録した写真のうち、すでに別の読みものが持ち主になっている写真 / その写真を加えて保存する", async () => {
    const { k, E, B, article } = await withPhotos();
    const [X] = await k.photos(E, 1);
    if (X === undefined) throw new Error("a photo");
    const other = await k.article({ photoIds: [X] }, "draft", E);
    await expectUnchanged(
      k,
      article,
      k.revise(E, article, content({ photoIds: [B, X] })),
      "MEDIA_PHOTO_ALREADY_OWNED",
    );
    expect(await k.ownerOf(X)).toEqual({ kind: "article", id: other.id });
  });

  it("judges the content's own errors before the version (「編集の競合」)", async () => {
    const k = articleKit();
    const E = await k.editor();
    const article = await k.article({}, "draft", E);
    await k.revise(E, article, content({ body: "先に保存" }));
    await expectCode(
      k.revise(E, article, content({ title: "一行目\n二行目" })),
      BusinessRuleError,
      "ARTICLE_INVALID_TITLE",
    );
    await expectCode(
      k.revise(E, article, content({ body: "古い版" })),
      ConflictError,
    );
  });
});
