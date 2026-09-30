import type { Article } from "@repo/core/domain/article/article";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { listArticles } from "../../discovery/listArticles";
import { searchByKeyword } from "../../discovery/searchByKeyword";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { articleKit, content } from "./kit";

const photoIdsOf = (article: Article) =>
  article.content.photos.items.map((photo) => photo.photoId);

describe("unpublishArticle", () => {
  it("unpublishArticle#1 公開中の読みもの。紹介先を持つ / 公開を取り下げる", async () => {
    const k = articleKit();
    const E = await k.editor();
    const { refs } = await k.viewableTargets();
    const published = await k.article(
      { title: "取り下げる読みもの", showcases: [refs.place] },
      "published",
      E,
    );
    const visible = async () => ({
      list: (
        await listArticles({
          container: k.container,
          input: { pagination: { page: 1, limit: 100 } },
        })
      ).items.map((item) => item.articleId),
      search: (
        await searchByKeyword({
          container: k.container,
          input: {
            keyword: "取り下げる読みもの",
            kinds: "article",
            pagination: { page: 1, limit: 100 },
          },
        })
      ).results.article?.items.map((item) => item.articleId),
      showcasing: await k.showcasing(refs.place),
    });
    expect(await visible()).toEqual({
      list: [published.id],
      search: [published.id],
      showcasing: [published.id],
    });
    await k.readPublic(published.id);
    const mark = await k.mark();
    const unpublished = await k.unpublish(E, published.id);
    expect(unpublished.publication).toEqual({
      status: "unpublished",
      firstPublishedAt:
        published.publication.status === "published"
          ? published.publication.firstPublishedAt
          : null,
      reason: "byManager",
    });
    expect(unpublished.content).toEqual(published.content);
    expect(unpublished.version).toBe(published.version + 1);
    expect(await k.stored(published.id)).toEqual(unpublished);
    expect(await k.since(mark)).toEqual([]);
    expect(await visible()).toEqual({ list: [], search: [], showcasing: [] });
    await expectCode(k.readPublic(published.id), NotFoundError);
  });

  it("unpublishArticle#2 別の編集担当者が公開した読みもの / 公開を取り下げる", async () => {
    const k = articleKit();
    const A = await k.editor("a");
    const B = await k.editor("b");
    const published = await k.article({}, "published", A);
    expect((await k.unpublish(B, published.id)).publication.status).toBe(
      "unpublished",
    );
  });

  it("unpublishArticle#3 公開を取り下げた読みもの / listArticlesForEditing を公開の取り下げで絞って読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const unpublished = await k.article({}, "unpublished", E);
    const { items } = await k.list(E, "unpublished");
    expect(items).toEqual([unpublished]);
    expect(items[0]?.publication).toMatchObject({ reason: "byManager" });
  });

  it("unpublishArticle#4 公開を取り下げた読みもの / reviseArticle で内容を直し、publishArticle で公開する", async () => {
    const k = articleKit();
    const E = await k.editor();
    const unpublished = await k.article({}, "unpublished", E);
    await k.revise(
      E,
      unpublished,
      content({ body: "直した本文", photoIds: photoIdsOf(unpublished) }),
    );
    const published = await k.publish(E, unpublished.id);
    expect(published.content.body).toBe("直した本文");
  });

  it("unpublishArticle#5 下書きの読みもの / 公開を取り下げる", async () => {
    const k = articleKit();
    const E = await k.editor();
    const draft = await k.article({}, "draft", E);
    await expectCode(
      k.unpublish(E, draft.id),
      BusinessRuleError,
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
    expect(await k.stored(draft.id)).toEqual(draft);
  });

  it("unpublishArticle#6 編集担当者 A が公開中の読みものを開いた後、編集担当者 B が先に取り下げた / A が取り下げる", async () => {
    const k = articleKit();
    const A = await k.editor("a");
    const B = await k.editor("b");
    const published = await k.article({}, "published", A);
    const byB = await k.unpublish(B, published.id);
    await expectCode(
      k.unpublish(A, published.id),
      BusinessRuleError,
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
    expect(await k.stored(published.id)).toEqual(byB);
  });

  it("unpublishArticle#7 編集担当者 A と B の、同じ公開中の読みものの公開を取り下げる要求が同時に実行され、どちらも公開中の読みものを読んだ後に、B が先にコミットした / A の要求がコミットする", async () => {
    const k = articleKit();
    const A = await k.editor("a");
    const B = await k.editor("b");
    const published = await k.article({}, "published", A);
    let byB: Article | null = null;
    const racing = commitAfter(k.container, async () => {
      byB = await k.unpublish(B, published.id);
    });
    await expectCode(k.unpublish(A, published.id, racing), ConflictError);
    expect(byB).not.toBeNull();
    expect(await k.stored(published.id)).toEqual(byB);
  });

  it("unpublishArticle#8 編集担当者 A が公開中の読みものを開いた後、編集担当者 B が内容を保存した / A が取り下げる", async () => {
    const k = articleKit();
    const A = await k.editor("a");
    const B = await k.editor("b");
    const published = await k.article({}, "published", A);
    await k.revise(
      B,
      published,
      content({ body: "Bの本文", photoIds: photoIdsOf(published) }),
    );
    const unpublished = await k.unpublish(A, published.id);
    expect(unpublished.content.body).toBe("Bの本文");
    expect(unpublished.publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
  });

  it("unpublishArticle#9 公開中の読みものを開いている間に、編集担当者の任命を解かれた利用者 / 取り下げる", async () => {
    const k = articleKit();
    const E = await k.editor();
    const published = await k.article({}, "published", E);
    const racing = commitAfter(k.container, () => k.revokeHolder("editor", E));
    await expectCode(k.unpublish(E, published.id, racing), ForbiddenError);
    expect(await k.stored(published.id)).toEqual(published);
  });
});
