import { Article } from "@repo/core/domain/article/article";
import { ArticleId, RegionId } from "@repo/core/domain/common/ids";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import {
  listingFactory,
  TODAY,
} from "@repo/core/domain/listing/testing/samples";
import { samplePlace } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import type { ReferenceResolution } from "../entry";
import { Standing } from "../standing";
import { ViewProjection } from "../viewProjection";
import { VisibilityPolicy } from "../visibilityPolicy";

const f = listingFactory();
const T = new Date("2026-07-01T00:00:00.000Z");

const draft = (
  content: Partial<Parameters<typeof Article.create>[0]["content"]> = {},
) =>
  Article.create(
    {
      id: ArticleId.create(f.ids.next()),
      content: {
        title: "路地の話",
        body: "本文",
        photoIds: [f.photo().photoId, f.photo().photoId],
        showcases: [],
        ...content,
      },
    },
    T,
  ).entity;

describe("articles in VisibilityPolicy", () => {
  it("an article is viewable only while published", () => {
    const created = draft();
    const published = Article.publish(created, T);
    const unpublished = Article.unpublish(published, T);
    expect(VisibilityPolicy.isArticleViewable(created)).toBe(false);
    expect(VisibilityPolicy.isArticleViewable(published)).toBe(true);
    expect(VisibilityPolicy.isArticleViewable(unpublished)).toBe(false);
    expect(VisibilityPolicy.viewableArticle(published)).toBe(true);
    expect(VisibilityPolicy.viewableArticle(unpublished)).toBe(false);
  });

  it("both scenes admit an article (it has no standing that changes)", () => {
    const standing = Standing.ofArticle();
    expect(VisibilityPolicy.isDiscoverable(standing)).toBe(true);
    expect(VisibilityPolicy.admits("discovery", standing)).toBe(true);
    expect(VisibilityPolicy.admits("reference", standing)).toBe(true);
  });
});

describe("articles in ViewProjection", () => {
  it("articleSummary shows the first photo and the title, not the body", () => {
    const A = Article.publish(draft(), T);
    const [cover] = A.content.photos.items;
    expect(ViewProjection.articleSummary(A)).toEqual({
      articleId: A.id,
      cover: { source: "own", photoId: cover?.photoId, framing: null },
      title: "路地の話",
    });
  });

  it("articleDetail keeps the content and projects the given showcases in order", () => {
    const P = samplePlace(f.place());
    const L = f.published(P.id);
    const placeEntry = ViewProjection.placeEntry(P, null, [], [L]);
    const A = Article.publish(
      draft({
        showcases: [
          { kind: "listing", id: L.id },
          { kind: "place", id: P.id },
        ],
      }),
      T,
    );
    const detail = ViewProjection.articleDetail(
      A,
      [
        { kind: "listing", entry: { listing: L, place: placeEntry } },
        { kind: "place", entry: placeEntry },
      ],
      TODAY,
    );
    expect(detail).toMatchObject({
      articleId: A.id,
      title: "路地の話",
      body: "本文",
      photos: A.content.photos.items,
    });
    expect(detail.showcases.map((showcase) => showcase.kind)).toEqual([
      "listing",
      "place",
    ]);
    expect(detail.showcases[0]).toEqual({
      kind: "listing",
      summary: ViewProjection.listingSummary(
        { listing: L, place: placeEntry },
        { kind: "displayed" },
        TODAY,
      ),
    });
  });

  it("previewArticle projects incomplete content and marks showcases viewers cannot see", () => {
    const P = samplePlace(f.place());
    const placeEntry = ViewProjection.placeEntry(P, null, [], []);
    const hidden: ShowcaseRef = {
      kind: "region",
      id: RegionId.create(f.ids.next()),
    };
    const shown: ShowcaseRef = { kind: "place", id: P.id };
    const content = draft({ title: " ", photoIds: [] }).content;
    const resolutions: readonly ReferenceResolution[] = [
      { ref: hidden, viewable: false },
      {
        ref: shown,
        viewable: true,
        target: { kind: "place", entry: placeEntry },
      },
    ];
    expect(ViewProjection.previewArticle(content, resolutions, TODAY)).toEqual({
      summary: { cover: null, title: null },
      detail: {
        title: null,
        body: "本文",
        photos: [],
        showcases: [
          { ref: hidden, viewable: false },
          {
            ref: shown,
            viewable: true,
            showcase: {
              kind: "place",
              summary: ViewProjection.placeSummary(placeEntry, {
                kind: "displayed",
              }),
            },
          },
        ],
      },
    });
  });
});
