import type { Article } from "@repo/core/domain/article/article";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { type ArticleKit, articleKit, content } from "./kit";

const idsOf = (items: readonly Article[]) => items.map((a) => a.id);

/** A's draft, then B's published and unpublished articles, one tick apart. */
async function oneOfEach() {
  const k = articleKit();
  const A = await k.editor("a");
  const B = await k.editor("b");
  const draft = await k.article({}, "draft", A);
  k.tick();
  const published = await k.article({}, "published", B);
  k.tick();
  const unpublished = await k.article({}, "unpublished", B);
  return { k, A, B, draft, published, unpublished };
}

async function takenDownArticle(k: ArticleKit, photos: number) {
  const E = await k.editor();
  const photoIds = await k.photos(E, photos);
  const published = await k.article({ photoIds }, "published", E);
  const [first] = photoIds;
  if (first === undefined) throw new Error("a photo");
  return k.takeDown(published.id, [first]);
}

describe("listArticlesForEditing", () => {
  it("listArticlesForEditing#1 編集担当者 A が作成した下書き、編集担当者 B が作成した公開中の読みもの、公開を取り下げた読みもの / A が、状態を絞らずに読む", async () => {
    const { k, A, draft, published, unpublished } = await oneOfEach();
    const page = await k.list(A);
    expect(idsOf(page.items)).toEqual([unpublished.id, published.id, draft.id]);
    expect(page.items.map((a) => a.publication.status)).toEqual([
      "unpublished",
      "published",
      "draft",
    ]);
    expect(page.count).toBe(3);
    expect(Object.keys(page.photos).sort()).toEqual(
      [published, unpublished]
        .map((a) => a.content.photos.items[0]?.photoId)
        .sort(),
    );
  });

  it("listArticlesForEditing#2 上と同じ / 下書きで絞って読む", async () => {
    const { k, A, draft } = await oneOfEach();
    const page = await k.list(A, "draft");
    expect(idsOf(page.items)).toEqual([draft.id]);
    expect(page.count).toBe(1);
  });

  it("listArticlesForEditing#3 上と同じ / 公開で絞って読む", async () => {
    const { k, A, published } = await oneOfEach();
    const page = await k.list(A, "published");
    expect(idsOf(page.items)).toEqual([published.id]);
    expect(page.count).toBe(1);
  });

  it("listArticlesForEditing#4 上と同じ / 公開の取り下げで絞って読む", async () => {
    const { k, A, unpublished } = await oneOfEach();
    const page = await k.list(A, "unpublished");
    expect(idsOf(page.items)).toEqual([unpublished.id]);
    expect(page.count).toBe(1);
  });

  it("listArticlesForEditing#5 編集担当者が取り下げた読みものと、申立てによる写真の削除で取り下げられた読みもの / 公開の取り下げで絞って読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const byManager = await k.article({}, "unpublished", E);
    const byTakedown = await takenDownArticle(k, 1);
    const page = await k.list(E, "unpublished");
    expect(page.count).toBe(2);
    const reasons = new Map(
      page.items.map((a) => [
        a.id,
        a.publication.status === "unpublished" ? a.publication.reason : null,
      ]),
    );
    expect(reasons.get(byManager.id)).toBe("byManager");
    expect(reasons.get(byTakedown.id)).toBe("photoTakedown");
  });

  it("listArticlesForEditing#6 申立てに基づいて写真が1枚削除され、公開が続いている読みもの / 読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    const article = await takenDownArticle(k, 2);
    const [item] = (await k.list(E)).items;
    expect(item?.id).toBe(article.id);
    expect(item?.publication.status).toBe("published");
    expect(item?.content.photos.takenDown).toBe(true);
  });

  it("listArticlesForEditing#7 一覧の最後にある読みもの / reviseArticle で保存してから読む", async () => {
    const { k, A, draft } = await oneOfEach();
    k.tick();
    await k.revise(A, draft, content({ body: "直した" }));
    expect((await k.list(A)).items[0]?.id).toBe(draft.id);
  });

  it("listArticlesForEditing#8 読みものが1件もない / 読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    expect(await k.list(E)).toEqual({ items: [], count: 0, photos: {} });
  });

  it("listArticlesForEditing#9 公開中の読みものがない / 公開で絞って読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    await k.article({}, "draft", E);
    await k.article({}, "unpublished", E);
    expect(await k.list(E, "published")).toEqual({
      items: [],
      count: 0,
      photos: {},
    });
  });

  it("listArticlesForEditing#10 編集担当者の役割を持たない利用者 / 読む", async () => {
    const k = articleKit();
    const U = await k.person("user");
    await k.article();
    await expectCode(k.list(U), ForbiddenError);
  });

  it("listArticlesForEditing#11 任命を解かれた利用者 / 読む", async () => {
    const k = articleKit();
    const E = await k.editor();
    await k.article({}, "draft", E);
    await k.revokeHolder("editor", E);
    await expectCode(k.list(E), ForbiddenError);
  });
});
