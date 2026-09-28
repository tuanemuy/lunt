import { PlaceId } from "@repo/core/domain/common/ids";
import type { ListingContentInput } from "@repo/core/domain/listing/content";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { NotFoundError } from "../../errors";
import { period } from "../../listing/__tests__/kit";
import { previewListingSubmission } from "../previewListingSubmission";
import { type AppKit, applicationKit } from "./kit";

const preview = (
  k: AppKit,
  who: Person,
  placeId: PlaceId,
  content: ListingContentInput,
) =>
  previewListingSubmission({
    container: k.container,
    actor: who.actor,
    input: { placeId, content },
  });

const framing = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };

describe("previewListingSubmission", () => {
  it.todo(
    "previewListingSubmission#1 店舗 p1 は公開されていて、公開中の地域 X に所属している。利用者 A が登録した写真 ph1、ph2 がある / A が、p1 と、写真 ph1・ph2（見せる範囲を含む）、名称、カテゴリー、説明、提供期間を入力して、見え方を確かめる",
  ); // S3A: region affiliations (Region)

  it("projects the entered photos, framing, names, category, description and period the way viewers would see them, without price or tagline", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place("山田商店");
    const [ph1, ph2] = await k.photos(A, 2);
    if (ph1 === undefined || ph2 === undefined) throw new Error("photos");
    const view = await preview(
      k,
      A,
      p1,
      k.content({
        name: "りんご飴",
        description: "甘い",
        photos: [{ photoId: ph1, framing }, ph2],
        offering: period("2026-07-20", "2026-08-31"),
      }),
    );
    expect(view.preview.summary).toMatchObject({
      placeId: p1,
      cover: { photoId: ph1, framing },
      listingName: "りんご飴",
      placeName: "山田商店",
      region: null,
      standing: { kind: "listing", offering: { phase: "upcoming" } },
    });
    expect(view.preview.detail).toMatchObject({
      name: "りんご飴",
      description: "甘い",
      photos: [
        { photoId: ph1, framing },
        { photoId: ph2, framing: null },
      ],
      offering: {
        kind: "period",
        period: { start: "2026-07-20", end: "2026-08-31" },
      },
      regions: [],
    });
    expect(view.category).toMatchObject({ name: "食べる" });
    expect([...view.photoRefs.keys()]).toEqual([ph1, ph2]);
    for (const shape of [view.preview.summary, view.preview.detail]) {
      expect(shape).not.toHaveProperty("price");
      expect(shape).not.toHaveProperty("tagline");
    }
  });

  it("previewListingSubmission#2 同上 / 見え方を確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const ph1 = await k.photo(A);
    const mark = await k.mark();
    await preview(k, A, p1, k.content({ photos: [ph1] }));
    expect(await k.photoOwner(ph1)).toBeNull();
    expect(await k.eventsSince(mark)).toEqual([]);
    expect(
      await k.run(({ applicationRepository }) =>
        applicationRepository.findPageBySubject(
          { kind: "place", id: p1 },
          {},
          { page: 1, limit: 10 },
        ),
      ),
    ).toEqual({ items: [], count: 0 });
  });

  it("previewListingSubmission#3 店舗 p1 の掲載 l1 の修正を入力している / A が、修正後の内容（名称を変え、写真を1枚加えた）を入力して、見え方を確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1, { name: "モーニング" });
    const before = await k.findListing(l1);
    const current = await k.listingInput(l1);
    const added = await k.photo(A);
    const view = await preview(k, A, p1, {
      ...current,
      name: "モーニングセット",
      photos: [...current.photos, { photoId: added, framing: null }],
    });
    expect(view.preview.detail.name).toBe("モーニングセット");
    expect(view.preview.detail.photos.map((p) => p.photoId)).toEqual([
      ...current.photos.map((p) => p.photoId),
      added,
    ]);
    expect(await k.findListing(l1)).toEqual(before);
  });

  it.todo(
    "previewListingSubmission#4 店舗 p1 は、公開中の地域 X と、公開を取り下げた地域 Z に所属している / A が見え方を確かめる",
  ); // S3A: region affiliations and region publication (Region)

  it("previewListingSubmission#5 店舗 p1 はどの地域にも所属していない / A が見え方を確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const view = await preview(
      k,
      A,
      p1,
      k.content({ photos: [await k.photo(A)] }),
    );
    expect(view.preview.summary.region).toBeNull();
    expect(view.preview.detail.regions).toEqual([]);
    expect(view.preview.detail.place.region).toBeNull();
  });

  it("previewListingSubmission#6 店舗 p1 は公開されている / A が、写真も名称も入力せずに、見え方を確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place("山田商店");
    const view = await preview(k, A, p1, k.content({ name: null, photos: [] }));
    expect(view.preview.summary.cover).toBeNull();
    expect(view.preview.summary.listingName).toBeNull();
    expect(view.preview.summary.placeName).toBe("山田商店");
    expect(view.preview.detail.name).toBeNull();
    expect(view.preview.detail.photos).toEqual([]);
  });

  it("previewListingSubmission#7 店舗 p1 はサービス運営者が非公開にしている / A が p1 で見え方を確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.suspendPlace(p1);
    await expectCode(preview(k, A, p1, k.content()), NotFoundError);
  });

  it("shows a retired category as the active one it resolves to", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const retired = await k.addCategory("季節もの");
    const successor = await k.category("買う");
    await k.retireCategory(retired, successor);
    const view = await preview(k, A, p1, k.content({ categoryId: retired }));
    expect(view.category).toEqual({ id: successor, name: "買う" });
    // The projection keeps the entered id; the caller resolves it.
    expect(view.preview.detail.categoryId).toBe(retired);
  });

  it("answers a place that does not exist as not found", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    await expectCode(
      preview(k, A, PlaceId.create(k.newId()), k.content()),
      NotFoundError,
    );
  });
});
