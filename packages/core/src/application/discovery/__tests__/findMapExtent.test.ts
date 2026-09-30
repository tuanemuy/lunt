import { GeoBounds } from "@repo/core/domain/common/geo";
import type { RegionId } from "@repo/core/domain/common/ids";
import { Geo } from "@repo/core/domain/discovery/geo";
import { Vicinity } from "@repo/core/domain/discovery/vicinity";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import { findMapExtent } from "../findMapExtent";
import type { PointInput } from "../views";
import { type DiscoveryKit, discoveryKit } from "./kit";
import { at, OTEMACHI, placeAt } from "./mapKit";
import { TEST_VICINITY_RADIUS_METERS } from "./testServices";

const fromFocus = (
  k: DiscoveryKit,
  areas: readonly (typeof OTEMACHI)[],
  origin: PointInput | null = null,
) =>
  findMapExtent({
    container: k.container,
    input: { kind: "focus", areas, origin },
  });

const fromRegion = (k: DiscoveryKit, regionId: RegionId) =>
  findMapExtent({
    container: k.container,
    input: { kind: "region", regionId },
  });

const inA = { profile: { address: SampleAddress.otemachi() } };
const inB = { profile: { address: SampleAddress.umeda() } };

/** P and Q in 大手町, S in 梅田, far from each other. */
async function spreadPlaces(k: DiscoveryKit) {
  const P = await placeAt(k.w, at(35.68, 139.76), inA);
  const Q = await placeAt(k.w, at(35.69, 139.78), inA);
  const S = await placeAt(k.w, at(34.7, 135.5), inB);
  return { P, Q, S };
}

describe("findMapExtent", () => {
  it("findMapExtent#1 選択エリアの中に店舗 P・Q、外に店舗 S がある / エリアの選択から求める", async () => {
    const k = await discoveryKit();
    const { P, Q } = await spreadPlaces(k);
    expect(await fromFocus(k, [OTEMACHI])).toEqual({
      basis: "areas",
      extent: Geo.extentOf([P.profile.location, Q.profile.location]),
    });
  });

  it("findMapExtent#2 閲覧できる店舗 P・Q・S が離れた位置にある / 空のエリアの選択から求める", async () => {
    const k = await discoveryKit();
    const { P, Q, S } = await spreadPlaces(k);
    expect(await fromFocus(k, [])).toEqual({
      basis: "everywhere",
      extent: Geo.extentOf([P, Q, S].map((place) => place.profile.location)),
    });
  });

  it("findMapExtent#3 上に加えて、さらに離れた位置に、閉店した店舗と非公開の店舗がある / 空のエリアの選択から求める", async () => {
    const k = await discoveryKit();
    const { P, Q, S } = await spreadPlaces(k);
    await placeAt(k.w, at(43.06, 141.35), { status: "permanentlyClosed" });
    await placeAt(k.w, at(26.21, 127.68), { suspended: true });
    expect((await fromFocus(k, [])).extent).toEqual(
      Geo.extentOf([P, Q, S].map((place) => place.profile.location)),
    );
  });

  it("findMapExtent#4 選択エリアの中に、店舗 P と、離れた位置の閉店した店舗 C がある / エリアの選択から求める", async () => {
    const k = await discoveryKit();
    const P = await placeAt(k.w, at(35.68, 139.76), inA);
    await placeAt(k.w, at(35.9, 140.1), {
      ...inA,
      status: "permanentlyClosed",
    });
    expect((await fromFocus(k, [OTEMACHI])).extent).toEqual(
      GeoBounds.create(P.profile.location, P.profile.location),
    );
  });

  it("findMapExtent#5 選択エリアの中に、掲載を持つ店舗 P と、掲載を持たない店舗 T がある / エリアの選択から求める", async () => {
    const k = await discoveryKit();
    const P = await placeAt(k.w, at(35.68, 139.76), inA);
    const T = await placeAt(k.w, at(35.7, 139.79), inA);
    await k.w.available(P.id);
    expect((await fromFocus(k, [OTEMACHI])).extent).toEqual(
      Geo.extentOf([P.profile.location, T.profile.location]),
    );
  });

  it("findMapExtent#6 地域 R に、閲覧できる店舗 P・Q が所属している / R を指定して求める", async () => {
    const k = await discoveryKit();
    const R = await k.w.region({ location: at(35.72, 139.77) });
    const P = await placeAt(k.w, at(35.7, 139.8));
    const Q = await placeAt(k.w, at(35.75, 139.74));
    await k.w.affiliate(P.id, [R.id]);
    await k.w.affiliate(Q.id, [R.id]);
    expect(await fromRegion(k, R.id)).toEqual({
      basis: "region",
      extent: GeoBounds.create(at(35.7, 139.74), at(35.75, 139.8)),
    });
  });

  it("findMapExtent#7 選択エリアの中に、閲覧できて閉店していない店舗が1つもない / エリアの選択から求める", async () => {
    const k = await discoveryKit();
    await placeAt(k.w, at(35.68, 139.76), {
      ...inA,
      status: "permanentlyClosed",
    });
    await placeAt(k.w, at(35.69, 139.77), { ...inA, suspended: true });
    await placeAt(k.w, at(34.7, 135.5), inB);
    expect(await fromFocus(k, [OTEMACHI])).toEqual({
      basis: "areas",
      extent: Geo.JAPAN,
    });
  });

  it("findMapExtent#8 店舗が1つもない / 空のエリアの選択から求める", async () => {
    const k = await discoveryKit();
    expect(await fromFocus(k, [])).toEqual({
      basis: "everywhere",
      extent: Geo.JAPAN,
    });
  });

  it("findMapExtent#9 閲覧できる店舗 P・Q・S がある / 空のエリアの選択と現在地から求める", async () => {
    const k = await discoveryKit();
    await spreadPlaces(k);
    const origin = at(35.0, 136.9);
    expect(await fromFocus(k, [], origin)).toEqual({
      basis: "vicinity",
      extent: Geo.boundsOf(
        Vicinity.create(origin, TEST_VICINITY_RADIUS_METERS),
      ),
    });
  });

  it("findMapExtent#10 選択エリアの中に店舗 P・Q がある / エリアの選択と現在地から求める", async () => {
    const k = await discoveryKit();
    const { P, Q } = await spreadPlaces(k);
    expect(await fromFocus(k, [OTEMACHI], at(34.7, 135.5))).toEqual({
      basis: "areas",
      extent: Geo.extentOf([P.profile.location, Q.profile.location]),
    });
  });

  it("findMapExtent#11 地域 R が運営による非公開 / R を指定して求める", async () => {
    const k = await discoveryKit();
    const R = await k.w.region({ state: "suspended" });
    const P = await k.w.place();
    await k.w.affiliate(P.id, [R.id]);
    expect(await fromRegion(k, R.id)).toEqual({
      basis: "region",
      extent: null,
    });
  });
});
