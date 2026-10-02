import { PERIODS } from "@repo/core/adapters/durableObject/__conformance__/discoveryFixtures";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import { Listing } from "@repo/core/domain/listing/listing";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { listArticles } from "../../discovery/listArticles";
import { ForbiddenError, NotFoundError } from "../../errors";
import type { PreviewArticleOutput } from "../previewArticle";
import { articleKit, content } from "./kit";

const shownRefs = (output: PreviewArticleOutput) =>
  output.preview.detail.showcases.flatMap((s) => (s.viewable ? [s.ref] : []));

/** A complete draft (title, body, one photo) showcasing a viewable place. */
async function completeDraft() {
  const k = articleKit();
  const E = await k.editor();
  const { refs } = await k.viewableTargets();
  const photoIds = await k.photos(E, 1);
  const draft = await k.article(
    { photoIds, showcases: [refs.place] },
    "draft",
    E,
  );
  return { k, E, draft, refs };
}

describe("previewArticle", () => {
  it("previewArticle#1 タイトル・本文・写真と、閲覧できる紹介先を持つ下書き / 編集担当者が見え方を確かめる", async () => {
    const { k, E, draft, refs } = await completeDraft();
    const mark = await k.mark();
    const output = await k.preview(E, draft.id);
    expect(output.preview.summary).toEqual({
      cover: {
        source: "own",
        photoId: draft.content.photos.items[0]?.photoId,
        framing: null,
      },
      title: draft.content.title,
    });
    expect(output.preview.detail).toMatchObject({
      title: draft.content.title,
      body: draft.content.body,
      photos: draft.content.photos.items,
    });
    expect(shownRefs(output)).toEqual([refs.place]);
    expect(output.hiddenShowcases).toEqual([]);
    expect(output.missingRequirements).toEqual([]);
    expect(output.status).toBe("draft");
    expect(await k.stored(draft.id)).toEqual(draft);
    expect(await k.since(mark)).toEqual([]);
  });

  it("previewArticle#2 上の下書きを publishArticle で公開した / Discovery の記事の読み取りを読む", async () => {
    const { k, E, draft } = await completeDraft();
    const { preview } = await k.preview(E, draft.id);
    await k.publish(E, draft.id);
    const { article } = await k.readPublic(draft.id);
    expect({
      title: article.title,
      body: article.body,
      photos: article.photos,
      showcases: article.showcases,
    }).toEqual({
      title: preview.detail.title,
      body: preview.detail.body,
      photos: preview.detail.photos,
      showcases: preview.detail.showcases.flatMap((s) =>
        s.viewable ? [s.showcase] : [],
      ),
    });
    const [summary] = (
      await listArticles({
        container: k.container,
        input: { pagination: { page: 1, limit: 10 } },
      })
    ).items;
    expect({ cover: summary?.cover, title: summary?.title }).toEqual(
      preview.summary,
    );
  });

  it("previewArticle#3 閲覧できる紹介先と、閲覧できない紹介先を持つ下書き / 見え方を確かめる", async () => {
    const k = articleKit();
    const E = await k.editor();
    const { listing, refs } = await k.viewableTargets();
    await k.world.updateListing(
      listing,
      (stored) => Listing.suspend(stored, k.tick()).entity,
    );
    const draft = await k.article(
      { showcases: [refs.listing, refs.region] },
      "draft",
      E,
    );
    const output = await k.preview(E, draft.id);
    expect(shownRefs(output)).toEqual([refs.region]);
    expect(output.hiddenShowcases).toEqual([refs.listing]);
  });

  it("previewArticle#4 紹介先をすべて、運営による非公開の掲載と公開を取り下げた地域にした下書き / 見え方を確かめる", async () => {
    const k = articleKit();
    const E = await k.editor();
    const { listing, region, refs } = await k.viewableTargets();
    await k.world.updateListing(
      listing,
      (stored) => Listing.suspend(stored, k.tick()).entity,
    );
    await k.world.updateRegion(
      region,
      (stored) => Region.unpublish(stored, k.tick()).entity,
    );
    const draft = await k.article(
      { showcases: [refs.listing, refs.region] },
      "draft",
      E,
    );
    const output = await k.preview(E, draft.id);
    expect(shownRefs(output)).toEqual([]);
    expect(output.hiddenShowcases).toEqual([refs.listing, refs.region]);
  });

  it("previewArticle#5 紹介先のない下書き / 見え方を確かめる", async () => {
    const k = articleKit();
    const E = await k.editor();
    const draft = await k.article({}, "draft", E);
    const output = await k.preview(E, draft.id);
    expect(output.preview.detail.showcases).toEqual([]);
    expect(output.hiddenShowcases).toEqual([]);
  });

  it("previewArticle#6 紹介先に、提供終了の掲載と終了したイベントを持つ下書き / 見え方を確かめる", async () => {
    const k = articleKit();
    const E = await k.editor();
    const place = await k.world.place();
    const ended = await k.world.endedBySchedule(place.id);
    const over = await k.world.occasion({ period: PERIODS.ended });
    const showcases: ShowcaseRef[] = [
      { kind: "listing", id: ended.id },
      { kind: "occasion", id: over.id },
    ];
    const draft = await k.article({ showcases }, "draft", E);
    const output = await k.preview(E, draft.id);
    expect(shownRefs(output)).toEqual(showcases);
    const standings = output.preview.detail.showcases.map((s) => {
      if (!s.viewable) return null;
      switch (s.showcase.kind) {
        case "listing":
          return s.showcase.summary.standing.offering.phase;
        case "occasion":
          return s.showcase.summary.standing.holding;
        default:
          return s.showcase.kind;
      }
    });
    expect(standings).toEqual(["ended", "ended"]);
  });

  it("previewArticle#7 タイトルと写真のない下書き / 見え方を確かめる", async () => {
    const k = articleKit();
    const E = await k.editor();
    const draft = await k.article({ title: "" }, "draft", E);
    const output = await k.preview(E, draft.id);
    expect(output.preview.summary).toEqual({ cover: null, title: null });
    expect(output.preview.detail.body).toBe(draft.content.body);
    expect(output.missingRequirements).toEqual(["title", "photos"]);
  });

  it("previewArticle#8 公開を取り下げた読みもの / 見え方を確かめる", async () => {
    const k = articleKit();
    const E = await k.editor();
    const stored = await k.article({}, "unpublished", E);
    const { article: unpublished } = await k.revise(
      E,
      stored,
      content({
        body: "",
        photoIds: stored.content.photos.items.map((p) => p.photoId),
      }),
    );
    const output = await k.preview(E, unpublished.id);
    expect(output.status).toBe("unpublished");
    expect(output.preview.detail.title).toBe(unpublished.content.title);
    expect(output.preview.detail.photos).toEqual(
      unpublished.content.photos.items,
    );
    expect(output.missingRequirements).toEqual(["body"]);
  });

  it("previewArticle#9 編集担当者 A が下書きを開いた後、編集担当者 B が公開した / A が見え方を確かめる", async () => {
    const { k, E: A, draft } = await completeDraft();
    const B = await k.editor("b");
    await k.publish(B, draft.id);
    const output = await k.preview(A, draft.id);
    expect(output.status).toBe("published");
    expect(output.missingRequirements).toEqual([]);
    expect(output.preview.detail.title).toBe(draft.content.title);
  });

  it("previewArticle#10 存在しない ArticleId / 見え方を確かめる", async () => {
    const k = articleKit();
    const E = await k.editor();
    await expectCode(
      k.preview(E, k.absentArticleId()),
      NotFoundError,
      "ARTICLE_NOT_FOUND",
    );
  });

  it("previewArticle#11 編集担当者の役割を持たない利用者 / 見え方を確かめる", async () => {
    const { k, draft } = await completeDraft();
    const U = await k.person("user");
    await expectCode(k.preview(U, draft.id), ForbiddenError);
  });
});
