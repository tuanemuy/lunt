import { RegionId } from "@repo/core/domain/common/ids";
import type { PublishedListing } from "@repo/core/domain/listing/listing";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import { listListingsOfRegion } from "../listListingsOfRegion";
import { REGION_NOT_FOUND } from "../viewRegion";
import { type DiscoveryKit, discoveryKit, expectNotFound } from "./kit";

const list = (
  k: DiscoveryKit,
  regionId: RegionId,
  pagination = { page: 1, limit: 10 },
) =>
  listListingsOfRegion({
    container: k.container,
    input: { regionId, pagination },
  });

const listingIds = (out: Awaited<ReturnType<typeof list>>) =>
  out.items.map((summary) => summary.listingId);

const newestFirst = (listings: readonly PublishedListing[]) =>
  listings.map((listing) => listing.id).reverse();

/** A region with `places` affiliated places. */
async function regionWithPlaces(k: DiscoveryKit, places: number) {
  const R = await k.w.region({ name: "谷中" });
  const members = [];
  for (let i = 0; i < places; i += 1) {
    const place = await k.w.place();
    await k.w.affiliate(place.id, [R.id]);
    members.push(place);
  }
  return { R, places: members };
}

describe("listListingsOfRegion", () => {
  it("listListingsOfRegion#1 公開中の地域 R に所属する別々の店舗に、公開中かつ提供中の掲載 L1・L2・L3 があり、この順に最初に公開された / R で読む", async () => {
    const k = await discoveryKit();
    const { R, places } = await regionWithPlaces(k, 3);
    const listings = [];
    for (const place of places) listings.push(await k.w.available(place.id));
    const out = await list(k, R.id);
    expect(listingIds(out)).toEqual(newestFirst(listings));
    expect(out.count).toBe(3);
    const L3 = listings[2];
    const P3 = places[2];
    if (L3 === undefined || P3 === undefined) throw new Error("three");
    expect(out.items[0]).toEqual({
      listingId: L3.id,
      placeId: P3.id,
      cover: {
        source: "own",
        photoId: L3.content.photos.items[0]?.photoId,
        framing: L3.content.photos.items[0]?.framing,
      },
      listingName: L3.content.name,
      placeName: P3.profile.name,
      region: "谷中",
      standing: {
        kind: "listing",
        offering: { phase: "available" },
        operating: "open",
      },
    });
    expect(out.items[0]).not.toHaveProperty("price");
    expect(out.items[0]).not.toHaveProperty("tagline");
  });

  it("listListingsOfRegion#2 R に所属する店舗に、公開中かつ提供中の掲載が合わせて9件ある / 1ページ6件で1ページ目を読む（地域の詳細の掲載の区分）", async () => {
    const k = await discoveryKit();
    const { R, places } = await regionWithPlaces(k, 3);
    const listings = [];
    for (let i = 0; i < 9; i += 1) {
      const place = places[i % 3];
      if (place === undefined) throw new Error("a place");
      listings.push(await k.w.available(place.id));
    }
    const out = await list(k, R.id, { page: 1, limit: 6 });
    expect(listingIds(out)).toEqual(newestFirst(listings).slice(0, 6));
    expect(out.count).toBe(9);
  });

  it("listListingsOfRegion#3 掲載の店舗は地域 R と地域 S に所属し、代表地域は S / R で読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region({ name: "谷中" });
    const S = await k.w.region({ name: "根津" });
    const P = await k.w.place();
    await k.w.affiliate(P.id, [R.id, S.id], S.id);
    const L = await k.w.available(P.id);
    const [summary] = (await list(k, R.id)).items;
    expect(summary?.listingId).toBe(L.id);
    expect(summary?.region).toBe("谷中");
  });

  it("listListingsOfRegion#4 R に所属する店舗に、提供開始前の掲載、提供終了の掲載、一時非公開の掲載がある。R に所属する閉店した店舗と非公開の店舗に、公開中かつ提供中の掲載がある / R で読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    const open = await k.w.place();
    const resting = await k.w.place({ status: "temporarilyClosed" });
    const closed = await k.w.place({ status: "permanentlyClosed" });
    const hidden = await k.w.place({ suspended: true });
    for (const place of [open, resting, closed, hidden]) {
      await k.w.affiliate(place.id, [R.id]);
    }
    await k.w.upcoming(open.id);
    await k.w.endedBySchedule(open.id);
    await k.w.endedByHand(open.id);
    await k.w.unpublished(open.id);
    await k.w.available(closed.id);
    await k.w.available(hidden.id);
    const onResting = await k.w.available(resting.id);
    const out = await list(k, R.id);
    expect(listingIds(out)).toEqual([onResting.id]);
    expect(out.items[0]?.standing.operating).toBe("temporarilyClosed");
  });

  it("listListingsOfRegion#5 R に所属する店舗の掲載は、どれも選択中のエリア・カテゴリーの条件に合わない / R で読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    const far = await k.w.place({
      profile: { address: SampleAddress.umeda() },
    });
    const near = await k.w.place();
    for (const place of [far, near]) await k.w.affiliate(place.id, [R.id]);
    const [, other] = k.categoryIds;
    if (other === undefined) throw new Error("categories");
    const listings = [
      await k.w.available(far.id),
      await k.w.store(k.w.f.published(near.id, { categoryId: other })),
    ];
    expect(listingIds(await list(k, R.id))).toEqual(newestFirst(listings));
  });

  it("listListingsOfRegion#6 R に所属する店舗はあるが、公開中かつ提供中の掲載がない / R で読む", async () => {
    const k = await discoveryKit();
    const { R, places } = await regionWithPlaces(k, 1);
    const [P] = places;
    if (P === undefined) throw new Error("a place");
    await k.w.upcoming(P.id);
    await k.w.draft(P.id);
    const out = await list(k, R.id);
    expect(out.items).toEqual([]);
    expect(out.count).toBe(0);
  });

  it("listListingsOfRegion#7 R の掲載が、1ページの件数より多い / 1ページ目と2ページ目を読む", async () => {
    const k = await discoveryKit();
    const { R, places } = await regionWithPlaces(k, 2);
    const listings = [];
    for (let i = 0; i < 5; i += 1) {
      const place = places[i % 2];
      if (place === undefined) throw new Error("a place");
      listings.push(await k.w.available(place.id));
    }
    const first = await list(k, R.id, { page: 1, limit: 3 });
    const second = await list(k, R.id, { page: 2, limit: 3 });
    expect([...listingIds(first), ...listingIds(second)]).toEqual(
      newestFirst(listings),
    );
    expect(first.count).toBe(5);
    expect(second.count).toBe(5);
  });

  it("listListingsOfRegion#8 地域が公開の取り下げ、運営による非公開、または存在しない / その地域で読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    await k.w.available(P.id);
    const unpublished = await k.w.region({ state: "unpublished" });
    const suspended = await k.w.region({ state: "suspended" });
    await k.w.affiliate(P.id, [unpublished.id, suspended.id]);
    for (const id of [
      unpublished.id,
      suspended.id,
      RegionId.create(k.idGenerator.next()),
    ]) {
      await expectNotFound(list(k, id), REGION_NOT_FOUND);
    }
  });
});
