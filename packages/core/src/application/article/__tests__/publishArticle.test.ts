import type { Article } from "@repo/core/domain/article/article";
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
import { ConflictError, ForbiddenError } from "../../errors";
import { type ArticleKit, articleKit, content } from "./kit";

async function expectUnmet(
  k: ArticleKit,
  who: Person,
  article: Article,
  missing: readonly string[],
) {
  const error = await rejection(k.publish(who, article.id));
  expect(error).toBeInstanceOf(BusinessRuleError);
  expect((error as BusinessRuleError).code).toBe(
    "ARTICLE_PUBLISH_CONDITION_UNMET",
  );
  expect((error as PublishConditionUnmetError).missing).toEqual(missing);
  expect(await k.stored(article.id)).toEqual(article);
}

describe("publishArticle", () => {
  it("publishArticle#1 タイトル・本文・写真1枚を持つ下書き。紹介先はない / 公開する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [photo] = await k.photos(E, 1);
    if (photo === undefined) throw new Error("a photo");
    const draft = await k.article({ photoIds: [photo] }, "draft", E);
    k.clock.advance(60_000);
    const now = k.clock.now();
    const mark = await k.mark();
    const published = await k.publish(E, draft.id);
    expect(published.publication).toEqual({
      status: "published",
      firstPublishedAt: now,
    });
    expect(published.version).toBe(draft.version + 1);
    expect(await k.stored(draft.id)).toEqual(published);
    expect(await k.since(mark)).toEqual([]);
    expect((await k.readPublic(draft.id)).article.articleId).toBe(draft.id);
  });

  it("publishArticle#2 別の編集担当者が作成した、公開条件を満たす下書き / 公開する", async () => {
    const k = articleKit();
    const A = await k.editor("a");
    const B = await k.editor("b");
    const [photo] = await k.photos(A, 1);
    if (photo === undefined) throw new Error("a photo");
    const draft = await k.article({ photoIds: [photo] }, "draft", A);
    expect((await k.publish(B, draft.id)).publication.status).toBe("published");
  });

  it("publishArticle#3 公開条件を満たす下書き。紹介先の1つが閲覧できない / 公開する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const { listing, refs } = await k.viewableTargets();
    await k.world.updateListing(
      listing,
      (stored) => Listing.suspend(stored, k.tick()).entity,
    );
    const [photo] = await k.photos(E, 1);
    if (photo === undefined) throw new Error("a photo");
    const draft = await k.article(
      { photoIds: [photo], showcases: [refs.listing, refs.place] },
      "draft",
      E,
    );
    const published = await k.publish(E, draft.id);
    expect(published.content.showcases).toEqual([refs.listing, refs.place]);
  });

  it("publishArticle#4 タイトルのない下書き / 公開する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [photo] = await k.photos(E, 1);
    if (photo === undefined) throw new Error("a photo");
    const draft = await k.article({ title: "", photoIds: [photo] }, "draft", E);
    await expectUnmet(k, E, draft, ["title"]);
  });

  it("publishArticle#5 写真のない下書き / 公開する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const draft = await k.article({}, "draft", E);
    await expectUnmet(k, E, draft, ["photos"]);
  });

  it("publishArticle#6 本文のない下書き / 公開する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [photo] = await k.photos(E, 1);
    if (photo === undefined) throw new Error("a photo");
    const draft = await k.article({ body: "", photoIds: [photo] }, "draft", E);
    await expectUnmet(k, E, draft, ["body"]);
  });

  it("publishArticle#7 タイトル・写真・本文のどれもない下書き / 公開する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const draft = await k.article({ title: "", body: "" }, "draft", E);
    await expectUnmet(k, E, draft, ["title", "photos", "body"]);
  });

  it("publishArticle#8 公開条件を欠く下書きに、未保存の変更がある / reviseArticle で保存し、続けて公開する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const draft = await k.article({}, "draft", E);
    const { article: saved } = await k.revise(
      E,
      draft,
      content({ title: "保存したタイトル" }),
    );
    await expectUnmet(k, E, saved, ["photos"]);
    expect((await k.stored(draft.id)).publication).toEqual({
      status: "draft",
    });
  });

  it("publishArticle#9 時刻 T1 に公開し、その後に unpublishArticle で取り下げた読みもの / 時刻 T2 に公開する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const T1 = k.clock.now();
    const unpublished = await k.article({}, "unpublished", E);
    k.clock.advance(3_600_000);
    const published = await k.publish(E, unpublished.id);
    expect(published.publication).toEqual({
      status: "published",
      firstPublishedAt: T1,
    });
  });

  it("publishArticle#10 申立てによる写真の削除で公開が取り下げられ、reviseArticle で写真を加えた読みもの / 公開する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const T1 = k.clock.now();
    const [A] = await k.photos(E, 1);
    if (A === undefined) throw new Error("a photo");
    const published = await k.article({ photoIds: [A] }, "published", E);
    const takenDown = await k.takeDown(published.id, [A]);
    const [C] = await k.photos(E, 1);
    if (C === undefined) throw new Error("a photo");
    await k.revise(E, takenDown, content({ photoIds: [C] }));
    k.clock.advance(60_000);
    expect((await k.publish(E, published.id)).publication).toEqual({
      status: "published",
      firstPublishedAt: T1,
    });
  });

  it("publishArticle#11 申立てによる写真の削除で公開が取り下げられ、写真を加えていない読みもの / 公開する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [A] = await k.photos(E, 1);
    if (A === undefined) throw new Error("a photo");
    const published = await k.article({ photoIds: [A] }, "published", E);
    const takenDown = await k.takeDown(published.id, [A]);
    await expectUnmet(k, E, takenDown, ["photos"]);
  });

  it("publishArticle#12 編集担当者 A が下書きを開いた後、編集担当者 B が先に公開した / A が公開する", async () => {
    const k = articleKit();
    const A = await k.editor("a");
    const B = await k.editor("b");
    const [photo] = await k.photos(A, 1);
    if (photo === undefined) throw new Error("a photo");
    const draft = await k.article({ photoIds: [photo] }, "draft", A);
    const byB = await k.publish(B, draft.id);
    await expectCode(
      k.publish(A, draft.id),
      BusinessRuleError,
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
    expect(await k.stored(draft.id)).toEqual(byB);
  });

  it("publishArticle#13 編集担当者 A と B の、同じ下書きを公開する要求が同時に実行され、どちらも下書きを読んだ後に、B が先にコミットした / A の要求がコミットする", async () => {
    const k = articleKit();
    const A = await k.editor("a");
    const B = await k.editor("b");
    const [photo] = await k.photos(A, 1);
    if (photo === undefined) throw new Error("a photo");
    const draft = await k.article({ photoIds: [photo] }, "draft", A);
    let byB: Article | null = null;
    const racing = commitAfter(k.container, async () => {
      byB = await k.publish(B, draft.id);
    });
    await expectCode(k.publish(A, draft.id, racing), ConflictError);
    expect(byB).not.toBeNull();
    expect(await k.stored(draft.id)).toEqual(byB);
  });

  it("publishArticle#14 編集担当者 A が下書きを開いた後、編集担当者 B が内容を保存した / A が公開する", async () => {
    const k = articleKit();
    const A = await k.editor("a");
    const B = await k.editor("b");
    const [photo] = await k.photos(A, 1);
    if (photo === undefined) throw new Error("a photo");
    const draft = await k.article({ photoIds: [photo] }, "draft", A);
    await k.revise(B, draft, content({ body: "Bの本文", photoIds: [photo] }));
    const published = await k.publish(A, draft.id);
    expect(published.content.body).toBe("Bの本文");
  });

  it("publishArticle#15 編集担当者の役割を持たない利用者 / 公開する", async () => {
    const k = articleKit();
    const U = await k.person("user");
    const E = await k.editor();
    const [photo] = await k.photos(E, 1);
    if (photo === undefined) throw new Error("a photo");
    const draft = await k.article({ photoIds: [photo] }, "draft", E);
    await expectCode(k.publish(U, draft.id), ForbiddenError);
    expect(await k.stored(draft.id)).toEqual(draft);
  });

  it("publishArticle#16 下書きを開いている間に、編集担当者の任命を解かれた利用者 / 公開する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const [photo] = await k.photos(E, 1);
    if (photo === undefined) throw new Error("a photo");
    const draft = await k.article({ photoIds: [photo] }, "draft", E);
    const racing = commitAfter(k.container, () => k.revokeHolder("editor", E));
    await expectCode(k.publish(E, draft.id, racing), ForbiddenError);
    expect(await k.stored(draft.id)).toEqual(draft);
  });
});
