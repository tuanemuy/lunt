import { PERIODS } from "@repo/core/adapters/durableObject/__conformance__/discoveryFixtures";
import { period } from "@repo/core/adapters/durableObject/__conformance__/listingFixtures";
import {
  insertPlaces,
  newPlace,
} from "@repo/core/adapters/durableObject/__conformance__/placeFixtures";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import type { Listing } from "@repo/core/domain/listing/listing";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it, vi } from "vitest";
import {
  type SearchByKeywordInput,
  type SearchByKeywordOutput,
  searchByKeyword,
} from "../searchByKeyword";
import { type DiscoveryKit, discoveryKit } from "./kit";

const search = (
  k: DiscoveryKit,
  keyword: string,
  options: Partial<Omit<SearchByKeywordInput, "keyword">> = {},
) =>
  searchByKeyword({
    container: k.container,
    input: {
      keyword,
      kinds: options.kinds ?? "all",
      pagination: options.pagination ?? { page: 1, limit: 10 },
    },
  });

const placeIds = (out: SearchByKeywordOutput) =>
  out.results.place?.items.map((item) => item.placeId) ?? [];
const listingIds = (out: SearchByKeywordOutput) =>
  out.results.listing?.items.map((item) => item.listingId) ?? [];

const harnessOf = (k: DiscoveryKit) => ({
  uow: k.container.unitOfWorkProvider,
  savedEvents: k.storedEvents,
});

const coverOf = (listing: Listing) => {
  const [photo] = listing.content.photos.items;
  return {
    source: "listing",
    listingId: listing.id,
    photoId: photo?.photoId,
    framing: photo?.framing,
  };
};

describe("searchByKeyword", () => {
  it("searchByKeyword#1 名称に「山田」を含む店舗・地域・掲載・イベントと、タイトルに「山田」を含む読みものが、すべて閲覧できる / 「山田」で、5種類すべてを読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place({ profile: { name: "山田珈琲店" } });
    const R = await k.w.region({ name: "山田の里" });
    const L = await k.w.store(k.w.f.published(P.id, { name: "山田の桃" }));
    const E = await k.w.occasion({ name: "山田まつり" });
    const A = await k.w.article({ title: "山田を歩く" });
    const out = await search(k, "山田");
    expect(Object.keys(out.results)).toEqual([
      "place",
      "region",
      "listing",
      "occasion",
      "article",
    ]);
    expect(out.results.place).toMatchObject({
      items: [{ placeId: P.id, name: "山田珈琲店" }],
      count: 1,
    });
    expect(out.results.region).toMatchObject({
      items: [{ regionId: R.id, name: "山田の里" }],
      count: 1,
    });
    expect(out.results.listing).toMatchObject({
      items: [{ listingId: L.id, placeId: P.id, listingName: "山田の桃" }],
      count: 1,
    });
    expect(out.results.occasion).toMatchObject({
      items: [{ occasionId: E.id, name: "山田まつり" }],
      count: 1,
    });
    const [articlePhoto] = A.content.photos.items;
    expect(out.results.article).toEqual({
      items: [
        {
          articleId: A.id,
          cover: {
            source: "own",
            photoId: articlePhoto?.photoId,
            framing: null,
          },
          title: "山田を歩く",
        },
      ],
      count: 1,
    });
    const [listingPhoto] = L.content.photos.items;
    if (listingPhoto === undefined || articlePhoto === undefined) {
      throw new Error("a photo");
    }
    expect(out.photos[listingPhoto.photoId]).toBeDefined();
    expect(out.photos[articlePhoto.photoId]).toBeDefined();
  });

  it("searchByKeyword#2 店舗「山田」「山田珈琲店」「喫茶山田屋」と、紹介にだけ「山田」を含む店舗「海の家」、所在地にだけ「山田」を含む店舗「港食堂」がある / 「山田」で店舗を読む", async () => {
    const k = await discoveryKit();
    const exact = await k.w.place({ profile: { name: "山田" } });
    const prefix = await k.w.place({ profile: { name: "山田珈琲店" } });
    const inside = await k.w.place({ profile: { name: "喫茶山田屋" } });
    await k.w.place({
      profile: { name: "海の家", description: "山田さんの店" },
    });
    const byAddress = await k.w.place({
      profile: {
        name: "港食堂",
        address: SampleAddress.otemachi("山田ビル1F"),
      },
    });
    const out = await search(k, "山田", { kinds: "place" });
    expect(placeIds(out)).toEqual([
      exact.id,
      prefix.id,
      inside.id,
      byAddress.id,
    ]);
    expect(out.results.place?.count).toBe(4);
  });

  it("searchByKeyword#3 関連度が同じ店舗が2つあり、登録の日時が違う / その語で店舗を読む", async () => {
    const k = await discoveryKit();
    const older = newPlace(
      k.w.f.place(),
      { name: "山田食堂" },
      new Date("2026-06-01T00:00:00.000Z"),
    );
    const newer = newPlace(
      k.w.f.place(),
      { name: "山田商店" },
      new Date("2026-06-02T00:00:00.000Z"),
    );
    await insertPlaces(harnessOf(k), older, newer);
    const out = await search(k, "山田", { kinds: "place" });
    expect(placeIds(out)).toEqual([newer.id, older.id]);
  });

  it("searchByKeyword#4 掲載「山田の桃」（説明に「直売」を含む）と、掲載「山田のぶどう」（「直売」をどこにも含まない）がある / 「山田 直売」で掲載を読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place({ profile: { name: "農園" } });
    const peach = await k.w.store(
      k.w.f.published(P.id, { name: "山田の桃", description: "畑から直売" }),
    );
    await k.w.store(k.w.f.published(P.id, { name: "山田のぶどう" }));
    const out = await search(k, "山田 直売", { kinds: "listing" });
    expect(listingIds(out)).toEqual([peach.id]);
    expect(out.results.listing?.count).toBe(1);
  });

  it("searchByKeyword#5 名称が「山田珈琲」の店舗と、名称が「珈琲山田」の店舗がある / 「山田 珈琲」と「珈琲 山田」で、それぞれ店舗を読む", async () => {
    const k = await discoveryKit();
    const a = await k.w.place({ profile: { name: "山田珈琲" } });
    const b = await k.w.place({ profile: { name: "珈琲山田" } });
    for (const keyword of ["山田 珈琲", "珈琲 山田"]) {
      const out = await search(k, keyword, { kinds: "place" });
      expect(new Set(placeIds(out))).toEqual(new Set([a.id, b.id]));
    }
  });

  it("searchByKeyword#6 提供開始前の掲載、提供終了の掲載、休業中の店舗、閉店した店舗、終了したイベント、中止のイベントが、どれもキーワードに一致する / そのキーワードで読む", async () => {
    const k = await discoveryKit();
    const resting = await k.w.place({
      status: "temporarilyClosed",
      profile: { name: "港の休業店" },
    });
    const closed = await k.w.place({
      status: "permanentlyClosed",
      profile: { name: "港の閉店店" },
    });
    const host = await k.w.place({ profile: { name: "農園" } });
    const upcoming = await k.w.store(
      k.w.f.published(host.id, {
        name: "港の桃",
        offering: period("2026-07-20", null),
      }),
    );
    const ended = await k.w.store(
      k.w.f.manuallyEnded(host.id, { name: "港のぶどう" }),
    );
    const over = await k.w.occasion({
      name: "港まつり",
      period: PERIODS.ended,
    });
    const cancelled = await k.w.occasion({
      name: "港の市",
      state: "cancelled",
    });
    const out = await search(k, "港");
    const standingOfPlace = (id: string) =>
      out.results.place?.items.find((item) => item.placeId === id)?.standing;
    expect(standingOfPlace(resting.id)).toEqual({
      kind: "place",
      operating: "temporarilyClosed",
    });
    expect(standingOfPlace(closed.id)).toEqual({
      kind: "place",
      operating: "permanentlyClosed",
    });
    const standingOfListing = (id: string) =>
      out.results.listing?.items.find((item) => item.listingId === id)
        ?.standing;
    expect(standingOfListing(upcoming.id)?.offering).toEqual({
      phase: "upcoming",
      startsOn: "2026-07-20",
    });
    expect(standingOfListing(ended.id)?.offering.phase).toBe("ended");
    const holdingOf = (id: string) =>
      out.results.occasion?.items.find((item) => item.occasionId === id)
        ?.standing.holding;
    expect(holdingOf(over.id)).toBe("ended");
    expect(holdingOf(cancelled.id)).toBe("cancelled");
  });

  it("searchByKeyword#7 写真のない店舗 P に、写真のある閲覧できる掲載がある。写真のない店舗 Q には、閲覧できる掲載がない / P と Q の両方に一致するキーワードで店舗を読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place({ profile: { name: "山田商店" } });
    const L = await k.w.available(P.id);
    const Q = await k.w.place({ profile: { name: "山田食堂" } });
    await k.w.unpublished(Q.id);
    const out = await search(k, "山田", { kinds: "place" });
    const coverOfPlace = (id: string) =>
      out.results.place?.items.find((item) => item.placeId === id)?.cover;
    expect(coverOfPlace(P.id)).toEqual(coverOf(L));
    expect(coverOfPlace(Q.id)).toBeNull();
  });

  it("searchByKeyword#8 写真のない店舗 P に、提供中の掲載 a1（先に公開）と、提供終了の掲載 e1（後に公開）がある。どちらも閲覧できる / P に一致するキーワードで店舗を読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place({ profile: { name: "山田商店" } });
    await k.w.available(P.id);
    const e1 = await k.w.endedByHand(P.id);
    const out = await search(k, "山田", { kinds: "place" });
    expect(out.results.place?.items[0]?.cover).toEqual(coverOf(e1));
  });

  it("searchByKeyword#9 キーワードに一致する対象が、どのエリアにも、どのカテゴリーにもある / 読む", async () => {
    const k = await discoveryKit();
    const places = [
      await k.w.place({
        profile: { name: "港A", address: SampleAddress.otemachi() },
      }),
      await k.w.place({
        profile: { name: "港B", address: SampleAddress.umeda() },
      }),
    ];
    const listings = [];
    for (const [i, categoryId] of k.categoryIds.entries()) {
      const place = places[i % places.length];
      if (place === undefined) throw new Error("a place");
      listings.push(
        await k.w.store(
          k.w.f.published(place.id, { name: "港の品", categoryId }),
        ),
      );
    }
    const out = await search(k, "港");
    expect(new Set(placeIds(out))).toEqual(new Set(places.map((p) => p.id)));
    expect(new Set(listingIds(out))).toEqual(
      new Set(listings.map((l) => l.id)),
    );
  });

  it("searchByKeyword#10 一時非公開の掲載、運営による非公開のイベント、公開を取り下げた地域と読みもの、非公開の店舗とその公開中の掲載が、どれもキーワードに一致する / そのキーワードで読む", async () => {
    const k = await discoveryKit();
    const host = await k.w.place({ profile: { name: "農園" } });
    await k.w.store(k.w.f.unpublished(host.id, { name: "港の桃" }));
    await k.w.occasion({ name: "港まつり", state: "suspended" });
    await k.w.region({ name: "港町", state: "unpublished" });
    await k.w.article({ title: "港の朝", state: "unpublished" });
    const hidden = await k.w.place({
      suspended: true,
      profile: { name: "港食堂" },
    });
    await k.w.store(k.w.f.published(hidden.id, { name: "港の定食" }));
    const out = await search(k, "港");
    expect(out.results).toEqual({
      place: { items: [], count: 0 },
      region: { items: [], count: 0 },
      listing: { items: [], count: 0 },
      occasion: { items: [], count: 0 },
      article: { items: [], count: 0 },
    });
  });

  it("searchByKeyword#11 一致する掲載が、1ページの件数より多い / 種類に掲載だけを指定して、2ページ目を読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place({ profile: { name: "農園" } });
    const made = [];
    for (let i = 0; i < 5; i += 1) {
      made.push(await k.w.store(k.w.f.published(P.id, { name: `桃${i}` })));
    }
    const exact = await k.w.store(k.w.f.published(P.id, { name: "桃" }));
    const first = await search(k, "桃", {
      kinds: "listing",
      pagination: { page: 1, limit: 4 },
    });
    const second = await search(k, "桃", {
      kinds: "listing",
      pagination: { page: 2, limit: 4 },
    });
    expect(second.results).toMatchObject({
      place: null,
      region: null,
      occasion: null,
      article: null,
    });
    expect([...listingIds(first), ...listingIds(second)]).toEqual([
      exact.id,
      ...made.map((l) => l.id).reverse(),
    ]);
    expect(listingIds(second)).toHaveLength(2);
    expect([
      first.results.listing?.count,
      second.results.listing?.count,
    ]).toEqual([6, 6]);
  });

  it("searchByKeyword#12 どの種類にも、キーワードに一致する対象がない / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place({ profile: { name: "山田商店" } });
    await k.w.available(P.id);
    await k.w.region();
    await k.w.occasion();
    await k.w.article({ title: "山田の話" });
    const out = await search(k, "存在しない語");
    expect(out.results).toEqual({
      place: { items: [], count: 0 },
      region: { items: [], count: 0 },
      listing: { items: [], count: 0 },
      occasion: { items: [], count: 0 },
      article: { items: [], count: 0 },
    });
  });

  it("searchByKeyword#13 — / 空のキーワード、または空白だけのキーワードで読む", async () => {
    const k = await discoveryKit();
    await k.w.place({ profile: { name: "山田商店" } });
    const queries = k.container.keywordSearchQueries;
    const spies = [
      vi.spyOn(queries, "searchPlaces"),
      vi.spyOn(queries, "searchRegions"),
      vi.spyOn(queries, "searchListings"),
      vi.spyOn(queries, "searchOccasions"),
      vi.spyOn(queries, "searchArticles"),
    ];
    for (const keyword of ["", "  　 "]) {
      await expect(search(k, keyword)).rejects.toMatchObject({
        code: CommonErrorCode.InvalidSearchKeyword,
      });
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
