import { ArticleId, ListingId, PlaceId } from "@repo/core/domain/common/ids";
import { PublishConditionUnmetError } from "@repo/core/domain/common/publication";
import { samplePhotoId } from "@repo/core/domain/common/testing/samples";
import { isRehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import {
  catchError,
  expectBusinessError,
} from "../../common/__tests__/expectBusinessError";
import { LINE_BREAK_CASES } from "../../common/__tests__/lineBreakCases";
import {
  Article,
  type ArticleContentInput,
  type PublishedArticle,
} from "../article";

const t0 = new Date("2026-09-01T00:00:00.000Z");
const t1 = new Date("2026-09-02T00:00:00.000Z");
const t2 = new Date("2026-09-03T00:00:00.000Z");
const id = ArticleId.create("article-1");
const photo = samplePhotoId;
const listing = { kind: "listing", id: ListingId.create("listing-1") } as const;
const place = { kind: "place", id: PlaceId.create("place-1") } as const;

const input = (
  over: Partial<ArticleContentInput> = {},
): ArticleContentInput => ({
  title: " 路地の話 ",
  body: "本文",
  photoIds: [photo(1), photo(2)],
  showcases: [listing, place],
  ...over,
});

const published = (): PublishedArticle =>
  Article.publish(Article.create({ id, content: input() }, t0).entity, t0);

describe("Article", () => {
  it("creates a draft with trimmed text, blank as null, every photo added", () => {
    const { entity, addedPhotoIds } = Article.create(
      { id, content: input({ body: "  " }) },
      t0,
    );
    expect(entity.publication).toEqual({ status: "draft" });
    expect(entity.content.title).toBe("路地の話");
    expect(entity.content.body).toBeNull();
    expect(addedPhotoIds).toEqual([photo(1), photo(2)]);
    expect(entity.updatedAt).toEqual(t0);
  });

  it("rejects invalid content through the value objects", () => {
    expectBusinessError(
      () => Article.create({ id, content: input({ title: "a\nb" }) }, t0),
      "ARTICLE_INVALID_TITLE",
    );
    expectBusinessError(
      () =>
        Article.create(
          { id, content: input({ body: "x".repeat(20_001) }) },
          t0,
        ),
      "ARTICLE_INVALID_BODY",
    );
    expectBusinessError(
      () =>
        Article.create(
          { id, content: input({ photoIds: [photo(1), photo(1)] }) },
          t0,
        ),
      "ARTICLE_DUPLICATE_PHOTO",
    );
    expectBusinessError(
      () =>
        Article.create(
          { id, content: input({ showcases: [place, place] }) },
          t0,
        ),
      "ARTICLE_INVALID_SHOWCASE_LIST",
    );
  });

  it("accepts a 100-character title and rejects 101 characters or any line terminator", () => {
    const hundred = "あ".repeat(100);
    expect(
      Article.create({ id, content: input({ title: hundred }) }, t0).entity
        .content.title,
    ).toBe(hundred);
    expectBusinessError(
      () =>
        Article.create({ id, content: input({ title: `${hundred}あ` }) }, t0),
      "ARTICLE_INVALID_TITLE",
    );
    for (const code of [0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029]) {
      const title = `前${String.fromCharCode(code)}後`;
      expectBusinessError(
        () => Article.create({ id, content: input({ title }) }, t0),
        "ARTICLE_INVALID_TITLE",
      );
    }
  });

  it("attaches the missing requirements when a revise or a publish fails the condition", () => {
    const reviseError = catchError(() =>
      Article.revise(
        published(),
        input({ title: "", body: "", photoIds: [photo(1)] }),
        t1,
      ),
    );
    expect(reviseError).toBeInstanceOf(PublishConditionUnmetError);
    expect((reviseError as PublishConditionUnmetError).missing).toEqual([
      "title",
      "body",
    ]);
    const draft = Article.create(
      { id, content: input({ photoIds: [] }) },
      t0,
    ).entity;
    const publishError = catchError(() => Article.publish(draft, t1));
    expect(publishError).toBeInstanceOf(PublishConditionUnmetError);
    expect((publishError as PublishConditionUnmetError).missing).toEqual([
      "photos",
    ]);
  });

  it("keeps a published article published when a takedown leaves photos, the next one the cover", () => {
    const { entity, eventDrafts } = Article.takeDownPhotos(
      published(),
      [photo(1)],
      t1,
    );
    expect(entity.publication).toEqual({
      status: "published",
      firstPublishedAt: t0,
    });
    expect(entity.content.photos.items[0]).toEqual({ photoId: photo(2) });
    expect(entity.content.photos.takenDown).toBe(true);
    expect(eventDrafts[0]?.payload).toEqual({
      owner: { kind: "article", id },
      photoIds: [photo(1)],
      unpublished: false,
    });
  });

  it("reports missing requirements in title, photos, body order", () => {
    const empty = Article.create(
      { id, content: { title: "", body: "", photoIds: [], showcases: [] } },
      t0,
    ).entity;
    expect(Article.missingRequirements(empty.content)).toEqual([
      "title",
      "photos",
      "body",
    ]);
  });

  it("revises the whole content, releasing dropped photos and returning added ones", () => {
    const { entity, eventDrafts, addedPhotoIds } = Article.revise(
      published(),
      input({ photoIds: [photo(2), photo(3)], showcases: [place] }),
      t1,
    );
    expect(entity.version).toBe(1 + 1);
    expect(entity.updatedAt).toEqual(t1);
    expect(entity.content.showcases).toEqual([place]);
    expect(addedPhotoIds).toEqual([photo(3)]);
    expect(eventDrafts).toEqual([
      {
        type: "photos.released",
        payload: { photoIds: [photo(1)] },
        occurredAt: t1,
        aggregateId: id,
      },
    ]);
  });

  it("returns the same article for unchanged content", () => {
    const article = published();
    const result = Article.revise(article, input(), t1);
    expect(result.entity).toBe(article);
    expect(result.eventDrafts).toEqual([]);
    expect(result.addedPhotoIds).toEqual([]);
  });

  it("refuses a save that leaves a published article unpublishable", () => {
    expectBusinessError(
      () => Article.revise(published(), input({ photoIds: [] }), t1),
      "ARTICLE_PUBLISH_CONDITION_UNMET",
    );
  });

  it("keeps firstPublishedAt across unpublishing and publishing again", () => {
    const again = Article.publish(Article.unpublish(published(), t1), t2);
    expect(again.publication).toEqual({
      status: "published",
      firstPublishedAt: t0,
    });
  });

  it("refuses publishing a published article before checking the condition", () => {
    expectBusinessError(
      () => Article.publish(published(), t1),
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
    const draft = Article.create({ id, content: input() }, t0).entity;
    expectBusinessError(
      () => Article.unpublish(draft, t1),
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
  });

  it("unpublishes on taking down the last photo and emits both events", () => {
    const one = Article.publish(
      Article.create({ id, content: input({ photoIds: [photo(1)] }) }, t0)
        .entity,
      t0,
    );
    const { entity, eventDrafts } = Article.takeDownPhotos(one, [photo(1)], t1);
    expect(entity.publication).toEqual({
      status: "unpublished",
      firstPublishedAt: t0,
      reason: "photoTakedown",
    });
    expect(entity.content.photos.takenDown).toBe(true);
    expect(eventDrafts.map((draft) => draft.type)).toEqual([
      "content.photos_taken_down",
      "photos.released",
    ]);
    expect(eventDrafts[0]?.payload).toEqual({
      owner: { kind: "article", id },
      photoIds: [photo(1)],
      unpublished: true,
    });
  });

  it("keeps a draft a draft on a takedown and refuses a photo it lacks", () => {
    const draft = Article.create({ id, content: input() }, t0).entity;
    const { entity, eventDrafts } = Article.takeDownPhotos(
      draft,
      [photo(1)],
      t1,
    );
    expect(entity.publication).toEqual({ status: "draft" });
    expect(eventDrafts[0]?.payload).toMatchObject({ unpublished: false });
    expectBusinessError(
      () => Article.takeDownPhotos(draft, [photo(9)], t1),
      "ARTICLE_PHOTO_NOT_FOUND",
    );
  });

  it("has the title as primary searchable text and the body as secondary", () => {
    expect(Article.searchableText(published())).toEqual({
      primary: "路地の話",
      secondary: ["本文"],
    });
    expect(Article.searchableTextOf({ title: null, body: null })).toEqual({
      primary: "",
      secondary: [],
    });
  });

  it("compares normalised input for the idempotent create", () => {
    const draft = Article.create({ id, content: input() }, t0).entity;
    expect(Article.sameContent(draft, input())).toBe(true);
    expect(Article.sameContent(draft, input({ title: "路地の話" }))).toBe(true);
    expect(
      Article.sameContent(draft, input({ showcases: [place, listing] })),
    ).toBe(false);
  });

  it("round-trips through the snapshot and rejects an invalid one", () => {
    const article = Article.unpublish(published(), t1);
    expect(Article.reconstruct(Article.snapshot(article))).toEqual(article);
    const broken = {
      ...Article.snapshot(published()),
      content: { ...Article.snapshot(published()).content, photoIds: [] },
    };
    expect(
      isRehydrationError(catchError(() => Article.reconstruct(broken))),
    ).toBe(true);
  });

  it.each(LINE_BREAK_CASES)("rejects a stored title with %s", (_label, c) => {
    const snapshot = Article.snapshot(published());
    const broken = {
      ...snapshot,
      content: { ...snapshot.content, title: `路地の${c}話` },
    };
    expect(
      isRehydrationError(catchError(() => Article.reconstruct(broken))),
    ).toBe(true);
  });
});
