import { Article } from "@repo/core/domain/article/article";
import { ArticleId, ListingId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { articleKit, content, EMPTY } from "./kit";

const articleOwner = (id: string) => ({ kind: "article", id });

describe("createArticle", () => {
  it("createArticle#1 編集担当者。自分が登録した、持ち主のない stored の写真が2枚 / タイトル・本文・写真2枚を入れ、紹介先なしで作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [p1, p2] = await k.photos(E, 2);
    if (p1 === undefined || p2 === undefined) throw new Error("two photos");
    const mark = await k.mark();
    const { article, missingRequirements } = await k.create(
      E,
      content({ photoIds: [p1, p2] }),
    );
    expect(article.publication).toEqual({ status: "draft" });
    expect(article.content.photos.items).toEqual([
      { photoId: p1 },
      { photoId: p2 },
    ]);
    expect(missingRequirements).toEqual([]);
    expect(await k.stored(article.id)).toEqual(article);
    expect(await k.ownerOf(p1)).toEqual(articleOwner(article.id));
    expect(await k.ownerOf(p2)).toEqual(articleOwner(article.id));
    expect(await k.since(mark)).toEqual([]);
  });

  it("createArticle#2 編集担当者 / タイトル・本文・写真のどれも入れずに作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const { article, missingRequirements } = await k.create(E, EMPTY);
    expect(article.content).toMatchObject({ title: null, body: null });
    expect(article.content.photos.items).toEqual([]);
    expect(missingRequirements).toEqual(["title", "photos", "body"]);
    expect(await k.stored(article.id)).toEqual(article);
  });

  it("createArticle#3 編集担当者。閲覧できる掲載・店舗・地域・イベントが1つずつある / 4つを紹介先にして作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const { refs } = await k.viewableTargets();
    const showcases = [refs.listing, refs.place, refs.region, refs.occasion];
    const mark = await k.mark();
    const { article } = await k.create(E, content({ showcases }));
    expect((await k.stored(article.id)).content.showcases).toEqual(showcases);
    expect(await k.since(mark)).toEqual([]);
  });

  it("createArticle#4 編集担当者。閲覧できるイベントを選んだ後、保存までの間に、そのイベントの公開が取り下げられた / そのイベントを紹介先にして作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const occasion = await k.world.occasion();
    const ref = { kind: "occasion", id: occasion.id } as const;
    await k.world.updateOccasion(
      occasion,
      (stored) => Occasion.unpublish(stored, k.tick()).entity,
    );
    const { article } = await k.create(E, content({ showcases: [ref] }));
    expect((await k.stored(article.id)).content.showcases).toEqual([ref]);
  });

  it("createArticle#5 作成した下書き / listArticlesForEditing を読む", async () => {
    const k = articleKit();
    const A = await k.editor("a");
    const B = await k.editor("b");
    const { article } = await k.create(A);
    expect((await k.list(A, "draft")).items).toEqual([article]);
    expect((await k.list(B)).items).toEqual([article]);
  });

  it("createArticle#6 作成が成立した読みもの / 同じ ArticleId と同じ内容で、もう一度作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [photo] = await k.photos(E, 1);
    if (photo === undefined) throw new Error("a photo");
    const id = k.newArticleId();
    const body = content({ photoIds: [photo] });
    const { article } = await k.create(E, body, id);
    const photoBefore = await k.findPhoto(photo);
    const mark = await k.mark();
    const replay = await k.create(E, body, id);
    expect(replay.article).toEqual(article);
    expect((await k.stored(article.id)).version).toBe(article.version);
    expect(await k.findPhoto(photo)).toEqual(photoBefore);
    expect(await k.since(mark)).toEqual([]);
  });

  it("createArticle#7 作成が成立した読みもの / 同じ ArticleId で、違うタイトルで作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const id = k.newArticleId();
    const { article } = await k.create(E, content(), id);
    await expectCode(
      k.create(E, content({ title: "違うタイトル" }), id),
      ConflictError,
    );
    expect(await k.stored(article.id)).toEqual(article);
  });

  it("createArticle#8 編集担当者 / 同じ掲載を紹介先に2回入れて作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const { refs } = await k.viewableTargets();
    const id = k.newArticleId();
    await expectCode(
      k.create(E, content({ showcases: [refs.listing, refs.listing] }), id),
      BusinessRuleError,
      "ARTICLE_INVALID_SHOWCASE_LIST",
    );
    expect(await k.find(ArticleId.create(id))).toBeNull();
  });

  it("createArticle#9 編集担当者 / 改行を含むタイトルで作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [photo] = await k.photos(E, 1);
    if (photo === undefined) throw new Error("a photo");
    const id = k.newArticleId();
    await expectCode(
      k.create(E, content({ title: "一行目\n二行目", photoIds: [photo] }), id),
      BusinessRuleError,
      "ARTICLE_INVALID_TITLE",
    );
    expect(await k.find(ArticleId.create(id))).toBeNull();
    expect(await k.ownerOf(photo)).toBeNull();
  });

  it("createArticle#10 編集担当者。別の人が登録した、持ち主のない写真 / その写真を入れて作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const other = await k.person("other");
    const [photo] = await k.photos(other, 1);
    if (photo === undefined) throw new Error("a photo");
    const id = k.newArticleId();
    await expectCode(
      k.create(E, content({ photoIds: [photo] }), id),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_REGISTRANT",
    );
    expect(await k.find(ArticleId.create(id))).toBeNull();
    expect(await k.ownerOf(photo)).toBeNull();
  });

  it("createArticle#11 編集担当者。すでに別の読みものが持ち主になっている写真 / その写真を入れて作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [photo] = await k.photos(E, 1);
    if (photo === undefined) throw new Error("a photo");
    const { article: first } = await k.create(
      E,
      content({ photoIds: [photo] }),
    );
    const id = k.newArticleId();
    await expectCode(
      k.create(E, content({ photoIds: [photo] }), id),
      BusinessRuleError,
      "MEDIA_PHOTO_ALREADY_OWNED",
    );
    expect(await k.find(ArticleId.create(id))).toBeNull();
    expect(await k.ownerOf(photo)).toEqual(articleOwner(first.id));
  });

  it("createArticle#12 編集担当者。存在しない PhotoId と、自分が登録した写真 / 両方を入れて作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [own] = await k.photos(E, 1);
    if (own === undefined) throw new Error("a photo");
    const id = k.newArticleId();
    await expectCode(
      k.create(E, content({ photoIds: [k.absentPhotoId(), own] }), id),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_AVAILABLE",
    );
    expect(await k.find(ArticleId.create(id))).toBeNull();
    expect(await k.ownerOf(own)).toBeNull();
  });

  it("createArticle#13 編集担当者の役割を持たない、ログインした利用者 / 作成する", async () => {
    const k = articleKit();
    const U = await k.person("user");
    const id = k.newArticleId();
    await expectCode(k.create(U, content(), id), ForbiddenError);
    expect(await k.find(ArticleId.create(id))).toBeNull();
  });

  it("createArticle#14 サービス運営者の役割だけを持つ利用者 / 作成する", async () => {
    const k = articleKit();
    const O = await k.person("operator");
    await k.operators(O);
    const id = k.newArticleId();
    await expectCode(k.create(O, content(), id), ForbiddenError);
    expect(await k.find(ArticleId.create(id))).toBeNull();
  });

  it("createArticle#15 入力している間に、編集担当者の任命を解かれた利用者 / 作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [photo] = await k.photos(E, 1);
    if (photo === undefined) throw new Error("a photo");
    const id = k.newArticleId();
    const racing = commitAfter(k.container, () => k.revokeHolder("editor", E));
    await expectCode(
      k.create(E, content({ photoIds: [photo] }), id, racing),
      ForbiddenError,
    );
    expect(await k.find(ArticleId.create(id))).toBeNull();
    expect(await k.ownerOf(photo)).toBeNull();
    await expectCode(k.create(E, content(), k.newArticleId()), ForbiddenError);
  });

  it("createArticle#16 編集担当者。自分が登録した、持ち主のない写真 A / 写真を A・A の順にして作成する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [A] = await k.photos(E, 1);
    if (A === undefined) throw new Error("a photo");
    const id = k.newArticleId();
    await expectCode(
      k.create(E, content({ photoIds: [A, A] }), id),
      BusinessRuleError,
      "ARTICLE_DUPLICATE_PHOTO",
    );
    expect(await k.find(ArticleId.create(id))).toBeNull();
    expect(await k.ownerOf(A)).toBeNull();
  });

  it("keeps a showcase whose target does not exist (EDT-02)", async () => {
    const k = articleKit();
    const E = await k.editor();
    const missing = {
      kind: "listing",
      id: ListingId.create(k.newArticleId()),
    } as const;
    const { article } = await k.create(E, content({ showcases: [missing] }));
    expect(
      Article.snapshot(await k.stored(article.id)).content.showcases,
    ).toEqual([missing]);
  });
});
