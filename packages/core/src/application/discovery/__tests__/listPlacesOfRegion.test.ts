import { RegionId } from "@repo/core/domain/common/ids";
import type { Place } from "@repo/core/domain/place/place";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import { listPlacesOfRegion } from "../listPlacesOfRegion";
import { REGION_NOT_FOUND } from "../viewRegion";
import { type DiscoveryKit, discoveryKit, expectNotFound } from "./kit";

const list = (
  k: DiscoveryKit,
  regionId: RegionId,
  pagination = { page: 1, limit: 10 },
) =>
  listPlacesOfRegion({
    container: k.container,
    input: { regionId, pagination },
  });

const placeIds = (out: Awaited<ReturnType<typeof list>>) =>
  out.items.map((summary) => summary.placeId);

/** Places affiliated with the region one after another (oldest first). */
async function affiliatedPlaces(
  k: DiscoveryKit,
  regionId: RegionId,
  count: number,
): Promise<readonly Place[]> {
  const places = [];
  for (let i = 0; i < count; i += 1) {
    const place = await k.w.place();
    await k.w.affiliate(place.id, [regionId]);
    places.push(place);
  }
  return places;
}

describe("listPlacesOfRegion", () => {
  it("listPlacesOfRegion#1 公開中の地域 R に、店舗 P（先に所属）と店舗 Q（後に所属）が所属している / R で読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region({ name: "谷中" });
    const Q = await k.w.place({ photos: 1 });
    const P = await k.w.place();
    await k.w.affiliate(P.id, [R.id]);
    await k.w.affiliate(Q.id, [R.id]);
    const out = await list(k, R.id);
    expect(placeIds(out)).toEqual([Q.id, P.id]);
    expect(out.count).toBe(2);
    expect(out.items[0]).toEqual({
      placeId: Q.id,
      cover: {
        source: "own",
        photoId: Q.profile.photos.items[0]?.photoId,
        framing: null,
      },
      name: Q.profile.name,
      address: Q.profile.address,
      location: Q.profile.location,
      region: "谷中",
      standing: { kind: "place", operating: "open" },
    });
  });

  it("listPlacesOfRegion#2 R に8つの店舗が、違う日時に所属している / 1ページ6件で1ページ目を読む（地域の詳細の店舗の区分）", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    const places = await affiliatedPlaces(k, R.id, 8);
    const out = await list(k, R.id, { page: 1, limit: 6 });
    expect(placeIds(out)).toEqual(
      places
        .map((place) => place.id)
        .reverse()
        .slice(0, 6),
    );
    expect(out.count).toBe(8);
  });

  it("listPlacesOfRegion#3 店舗 P は地域 R と地域 S に所属し、代表地域は S / R で読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region({ name: "谷中" });
    const S = await k.w.region({ name: "根津" });
    const P = await k.w.place();
    await k.w.affiliate(P.id, [R.id, S.id], S.id);
    const [summary] = (await list(k, R.id)).items;
    expect(summary?.placeId).toBe(P.id);
    expect(summary?.region).toBe("谷中");
  });

  it("listPlacesOfRegion#4 R に、休業中の店舗、閉店した店舗、非公開の店舗が所属している / R で読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    const resting = await k.w.place({ status: "temporarilyClosed" });
    const closed = await k.w.place({ status: "permanentlyClosed" });
    const hidden = await k.w.place({ suspended: true });
    for (const place of [resting, closed, hidden]) {
      await k.w.affiliate(place.id, [R.id]);
    }
    const out = await list(k, R.id);
    expect(placeIds(out)).toEqual([resting.id]);
    expect(out.items[0]?.standing).toEqual({
      kind: "place",
      operating: "temporarilyClosed",
    });
    expect(out.count).toBe(1);
  });

  it("listPlacesOfRegion#5 R の所属店舗の1つが、1回目に読んだ後に非公開になった / R でもう一度読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    const [P, Q] = await affiliatedPlaces(k, R.id, 2);
    if (P === undefined || Q === undefined) throw new Error("two places");
    expect(placeIds(await list(k, R.id))).toEqual([Q.id, P.id]);
    await k.w.suspendPlace(Q);
    const out = await list(k, R.id);
    expect(placeIds(out)).toEqual([P.id]);
    expect(out.count).toBe(1);
  });

  it("listPlacesOfRegion#6 R に所属する写真のない店舗 P に、写真のある閲覧できる掲載がある。写真のない店舗 Q には、閲覧できる掲載がない / R で読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    const [P, Q] = await affiliatedPlaces(k, R.id, 2);
    if (P === undefined || Q === undefined) throw new Error("two places");
    const L = await k.w.available(P.id);
    await k.w.draft(Q.id);
    const out = await list(k, R.id);
    const byId = new Map(out.items.map((item) => [item.placeId, item]));
    expect(byId.get(P.id)?.cover).toEqual({
      source: "listing",
      listingId: L.id,
      photoId: L.content.photos.items[0]?.photoId,
      framing: L.content.photos.items[0]?.framing,
    });
    expect(byId.get(Q.id)?.cover).toBeNull();
  });

  it("listPlacesOfRegion#7 R に所属する店舗は、どれも選択中のエリアの外にあり、選択中のカテゴリーの掲載を持たない / R で読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    const far = await k.w.place({
      profile: { address: SampleAddress.umeda() },
    });
    const near = await k.w.place();
    const [, other] = k.categoryIds;
    if (other === undefined) throw new Error("categories");
    await k.w.store(k.w.f.published(near.id, { categoryId: other }));
    for (const place of [far, near]) await k.w.affiliate(place.id, [R.id]);
    const out = await list(k, R.id);
    expect(placeIds(out)).toEqual([near.id, far.id]);
    expect(out.count).toBe(2);
  });

  it("listPlacesOfRegion#8 R に所属する店舗が、1ページの件数より多い / 1ページ目と2ページ目を読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    const places = await affiliatedPlaces(k, R.id, 5);
    const first = await list(k, R.id, { page: 1, limit: 3 });
    const second = await list(k, R.id, { page: 2, limit: 3 });
    expect([...placeIds(first), ...placeIds(second)]).toEqual(
      places.map((place) => place.id).reverse(),
    );
    expect(first.count).toBe(5);
    expect(second.count).toBe(5);
  });

  it("listPlacesOfRegion#9 R に所属する店舗がない / R で読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    await k.w.place();
    const out = await list(k, R.id);
    expect(out.items).toEqual([]);
    expect(out.count).toBe(0);
  });

  it("listPlacesOfRegion#10 地域が公開の取り下げ、運営による非公開、または存在しない / その地域で読む", async () => {
    const k = await discoveryKit();
    const ids = [
      (await k.w.region({ state: "unpublished" })).id,
      (await k.w.region({ state: "suspended" })).id,
      RegionId.create(k.idGenerator.next()),
    ];
    for (const id of ids) {
      const P = await k.w.place();
      if (id !== ids[2]) await k.w.affiliate(P.id, [id]);
      await expectNotFound(list(k, id), REGION_NOT_FOUND);
    }
  });
});
