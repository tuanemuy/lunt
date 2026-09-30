import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import type { BrowseCriteriaInput } from "../criteria";
import { findRegions } from "../findRegions";
import type { PointInput } from "../views";
import { type DiscoveryKit, discoveryKit } from "./kit";
import {
  at,
  criteriaInput,
  NO_CRITERIA,
  northOf,
  OTEMACHI,
  placeAt,
} from "./mapKit";
import { TEST_VICINITY_RADIUS_METERS } from "./testServices";

const find = (
  k: DiscoveryKit,
  options: Readonly<{
    criteria?: BrowseCriteriaInput;
    origin?: PointInput | null;
    pagination?: Readonly<{ page: number; limit: number }>;
  }> = {},
) =>
  findRegions({
    container: k.container,
    input: {
      criteria: options.criteria ?? NO_CRITERIA,
      origin: options.origin ?? null,
      pagination: options.pagination ?? { page: 1, limit: 10 },
    },
  });

const regionIds = (out: Awaited<ReturnType<typeof find>>) =>
  out.items.map((summary) => summary.regionId);

const IN_A = { address: SampleAddress.otemachi() };
const IN_B = { address: SampleAddress.umeda() };
const ORIGIN = at(35.7, 139.8);
const RADIUS = TEST_VICINITY_RADIUS_METERS;
const byArea = criteriaInput({ areas: [OTEMACHI] });

/**
 * R1 located in 大手町, R2 located in 梅田 with a place of `spec` in
 * 大手町, R3 entirely in 梅田.
 */
async function areaWorld(
  k: DiscoveryKit,
  spec: Readonly<{
    status?: "open" | "permanentlyClosed";
    suspended?: boolean;
  }> = {},
) {
  const R1 = await k.w.region({ content: IN_A });
  const R2 = await k.w.region({ content: IN_B });
  const R3 = await k.w.region({ content: IN_B });
  const member = await k.w.place({ ...spec, profile: IN_A });
  await k.w.affiliate(member.id, [R2.id]);
  const other = await k.w.place({ profile: IN_B });
  await k.w.affiliate(other.id, [R3.id]);
  return { R1, R2, R3 };
}

describe("findRegions", () => {
  it("findRegions#1 位置が選択エリアにある地域 R1、位置は外で所属する店舗の所在地が選択エリアにある地域 R2、どちらも外の地域 R3 がある / エリアを選び、現在地なしで読む", async () => {
    const k = await discoveryKit();
    const { R1, R2 } = await areaWorld(k);
    const out = await find(k, { criteria: byArea });
    expect(out.focus).toBe("areas");
    expect(regionIds(out)).toEqual([R2.id, R1.id]);
    expect(out.count).toBe(2);
    expect(out.items[1]).toEqual({
      regionId: R1.id,
      cover: {
        source: "own",
        photoId: R1.content.photos.items[0]?.photoId,
        framing: null,
      },
      name: R1.content.name,
      tagline: R1.content.tagline,
      address: R1.content.address,
      location: R1.content.location,
    });
    expect(Object.keys(out.photos).sort()).toEqual(
      [R1, R2].map((r) => r.content.photos.items[0]?.photoId).sort(),
    );
    expect(out.effective).toEqual({
      areas: [{ unit: "area", areaCode: "1000004" }],
      categoryIds: [],
    });
  });

  it("findRegions#2 上と同じ。R2 に所属する選択エリアの店舗が、閉店した店舗だけ / エリアを選んで読む", async () => {
    const k = await discoveryKit();
    const { R2 } = await areaWorld(k, { status: "permanentlyClosed" });
    expect(regionIds(await find(k, { criteria: byArea }))).toContain(R2.id);
  });

  it("findRegions#3 上と同じ。R2 に所属する選択エリアの店舗が、非公開の店舗だけ / エリアを選んで読む", async () => {
    const k = await discoveryKit();
    const { R1 } = await areaWorld(k, { suspended: true });
    expect(regionIds(await find(k, { criteria: byArea }))).toEqual([R1.id]);
  });

  it("findRegions#4 現在地から設定値の半径の中に地域 R1・R2（R1 のほうが近い）、半径の外に地域 R3 がある / 条件なし、現在地つきで読む", async () => {
    const k = await discoveryKit();
    await k.w.region({ location: northOf(ORIGIN, RADIUS * 1.5) });
    const R1 = await k.w.region({ location: northOf(ORIGIN, -RADIUS * 0.3) });
    const R2 = await k.w.region({ location: northOf(ORIGIN, RADIUS * 0.8) });
    const out = await find(k, { origin: ORIGIN });
    expect(out.focus).toBe("vicinity");
    expect(regionIds(out)).toEqual([R1.id, R2.id]);
    expect(out.count).toBe(2);
  });

  it("findRegions#5 地域 R4 の位置は現在地から遠いが、R4 に所属する休業中の店舗の位置は現在地のすぐ近く。地域 R5 の位置は、R4 の店舗より遠く、R4 の位置より近い。どちらも選択エリアにある / エリアを選び、現在地つきで読む", async () => {
    const k = await discoveryKit();
    const R4 = await k.w.region({
      location: northOf(ORIGIN, 9000),
      content: IN_A,
    });
    const R5 = await k.w.region({
      location: northOf(ORIGIN, 2000),
      content: IN_A,
    });
    const resting = await placeAt(k.w, northOf(ORIGIN, -100), {
      status: "temporarilyClosed",
    });
    await k.w.affiliate(resting.id, [R4.id]);
    expect(
      regionIds(await find(k, { criteria: byArea, origin: ORIGIN })),
    ).toEqual([R4.id, R5.id]);
  });

  it("findRegions#6 地域 R4 の位置は設定値の半径の外で、R4 に所属する閉店した店舗の位置が半径の中にある。地域 R5 の位置も半径の外で、R5 に所属する半径の中の店舗は非公開の店舗だけ / 条件なし、現在地つきで読む", async () => {
    const k = await discoveryKit();
    const R4 = await k.w.region({ location: northOf(ORIGIN, RADIUS * 5) });
    const R5 = await k.w.region({ location: northOf(ORIGIN, -RADIUS * 5) });
    const closed = await placeAt(k.w, northOf(ORIGIN, RADIUS * 0.5), {
      status: "permanentlyClosed",
    });
    const hidden = await placeAt(k.w, northOf(ORIGIN, -RADIUS * 0.5), {
      suspended: true,
    });
    await k.w.affiliate(closed.id, [R4.id]);
    await k.w.affiliate(hidden.id, [R5.id]);
    expect(regionIds(await find(k, { origin: ORIGIN }))).toEqual([R4.id]);
  });

  it("findRegions#7 現在地から設定値の半径の中に地域 R1・R2、半径の外に地域 R3 がある / 条件なし、現在地なしで読む", async () => {
    const k = await discoveryKit();
    const R1 = await k.w.region({ location: northOf(ORIGIN, RADIUS * 0.2) });
    const R2 = await k.w.region({ location: northOf(ORIGIN, RADIUS * 0.4) });
    const R3 = await k.w.region({ location: northOf(ORIGIN, RADIUS * 3) });
    const out = await find(k);
    expect(out.focus).toBe("everywhere");
    expect(regionIds(out)).toEqual([R3.id, R2.id, R1.id]);
  });

  it("findRegions#8 選択エリアの地域 R1・R2 が、どちらも現在地から設定値の半径の外にある / エリアを選び、現在地つきで読む", async () => {
    const k = await discoveryKit();
    const R1 = await k.w.region({
      location: northOf(ORIGIN, RADIUS * 2),
      content: IN_A,
    });
    const R2 = await k.w.region({
      location: northOf(ORIGIN, -RADIUS * 4),
      content: IN_A,
    });
    const out = await find(k, { criteria: byArea, origin: ORIGIN });
    expect(out.focus).toBe("areas");
    expect(regionIds(out)).toEqual([R1.id, R2.id]);
  });

  it("findRegions#9 地域 R に所属する店舗が、どれも「食べる」の掲載を持たない / カテゴリー「食べる」だけを選んで読む", async () => {
    const k = await discoveryKit();
    const [eat, buy] = k.categoryIds;
    if (eat === undefined || buy === undefined) throw new Error("categories");
    const R = await k.w.region();
    const P = await k.w.place();
    await k.w.affiliate(P.id, [R.id]);
    await k.w.store(k.w.f.published(P.id, { categoryId: buy }));
    const out = await find(k, {
      criteria: criteriaInput({ categoryIds: [eat] }),
    });
    expect(regionIds(out)).toEqual([R.id]);
    expect(out.effective).toEqual({ areas: [], categoryIds: [eat] });
  });

  it("findRegions#10 下書き、公開の取り下げ、運営による非公開の地域がある / 読む", async () => {
    const k = await discoveryKit();
    await k.w.region({ state: "draft" });
    await k.w.region({ state: "unpublished" });
    await k.w.region({ state: "suspended" });
    expect(await find(k)).toMatchObject({ items: [], count: 0 });
  });

  it("findRegions#11 選択エリアに地域がない / エリアを選んで読む", async () => {
    const k = await discoveryKit();
    await k.w.region({ content: IN_B });
    expect(await find(k, { criteria: byArea })).toMatchObject({
      focus: "areas",
      items: [],
      count: 0,
    });
  });
});
