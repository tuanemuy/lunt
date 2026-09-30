import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import type { BrowseCriteriaInput } from "../criteria";
import { listMapTargets, type MapTargetKinds } from "../listMapTargets";
import { readMapCells } from "../readMapCells";
import type { PointInput } from "../views";
import { type DiscoveryKit, discoveryKit } from "./kit";
import {
  at,
  BOUNDS,
  boundsInput,
  criteriaInput,
  GRID,
  inCell,
  NO_CRITERIA,
  northOf,
  OTEMACHI,
  placeAt,
  registeredAt,
} from "./mapKit";

const list = (
  k: DiscoveryKit,
  options: Readonly<{
    criteria?: BrowseCriteriaInput;
    origin?: PointInput | null;
    kinds?: MapTargetKinds;
    pagination?: Readonly<{ page: number; limit: number }>;
  }> = {},
) =>
  listMapTargets({
    container: k.container,
    input: {
      bounds: boundsInput(BOUNDS),
      criteria: options.criteria ?? NO_CRITERIA,
      origin: options.origin ?? null,
      kinds: options.kinds ?? "all",
      pagination: options.pagination ?? { page: 1, limit: 10 },
    },
  });

type Out = Awaited<ReturnType<typeof list>>;

const placeIds = (out: Out) =>
  out.places?.items.map((summary) => summary.placeId);

const regionIds = (out: Out) =>
  out.regions?.items.map((summary) => summary.regionId);

const inA = { profile: { address: SampleAddress.otemachi() } };

describe("listMapTargets", () => {
  it("listMapTargets#1 範囲と条件に合う店舗 P・Q と地域 R がある / 地域を選ばない readMapCells と同じ範囲と条件で、両方の種類を読む", async () => {
    const k = await discoveryKit();
    const P = await placeAt(k.w, inCell(0, 0), inA);
    const Q = await placeAt(k.w, inCell(2, 3), inA);
    await placeAt(k.w, inCell(1, 1), {
      profile: { address: SampleAddress.umeda() },
    });
    const R = await k.w.region({
      location: inCell(3, 1),
      content: { address: SampleAddress.otemachi() },
    });
    const criteria = criteriaInput({ areas: [OTEMACHI] });
    const out = await list(k, { criteria });
    const cells = await readMapCells({
      container: k.container,
      input: {
        bounds: boundsInput(BOUNDS),
        grid: GRID,
        criteria,
        selectedRegionId: null,
      },
    });
    const cellIds = cells.cells.flatMap((cell) =>
      cell.kind === "single" ? [cell.place.placeId] : [],
    );
    expect([...(placeIds(out) ?? [])].sort()).toEqual([...cellIds].sort());
    expect([...(placeIds(out) ?? [])].sort()).toEqual([P.id, Q.id].sort());
    expect(out.places?.count).toBe(2);
    expect(regionIds(out)).toEqual([R.id]);
    expect(out.regions?.count).toBe(1);
    expect(cells.regions.map((summary) => summary.regionId)).toEqual([R.id]);
    expect(out.effective).toEqual({
      areas: [{ unit: "area", areaCode: "1000004" }],
      categoryIds: [],
    });
  });

  it("listMapTargets#2 店舗の登録の日時と、地域の最初の公開の日時が、それぞれ違う / 現在地なしで読む", async () => {
    const k = await discoveryKit();
    const P1 = await registeredAt(
      k,
      new Date("2026-06-01T00:00:00Z"),
      inCell(0, 0),
    );
    const P3 = await registeredAt(
      k,
      new Date("2026-06-03T00:00:00Z"),
      inCell(1, 1),
    );
    const P2 = await registeredAt(
      k,
      new Date("2026-06-02T00:00:00Z"),
      inCell(2, 2),
    );
    const R1 = await k.w.region({ location: inCell(3, 0) });
    const R2 = await k.w.region({ location: inCell(3, 1) });
    const out = await list(k);
    expect(placeIds(out)).toEqual([P3.id, P2.id, P1.id]);
    expect(regionIds(out)).toEqual([R2.id, R1.id]);
  });

  it("listMapTargets#3 店舗と地域の位置が、現在地から違う距離にある / 現在地つきで読む", async () => {
    const k = await discoveryKit();
    const origin = at(35.7, 139.8);
    const far = await placeAt(k.w, northOf(origin, 3000));
    const near = await placeAt(k.w, northOf(origin, -500));
    const nearRegion = await k.w.region({ location: northOf(origin, 800) });
    const farRegion = await k.w.region({ location: northOf(origin, -4000) });
    const out = await list(k, { origin });
    expect(placeIds(out)).toEqual([near.id, far.id]);
    expect(regionIds(out)).toEqual([nearRegion.id, farRegion.id]);
  });

  it("listMapTargets#4 2つの地域に所属し、代表地域を選んでいる休業中の店舗 P がある / 読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region({ name: "谷中" });
    const S = await k.w.region({ name: "根津" });
    const P = await placeAt(k.w, inCell(1, 1), {
      photos: 1,
      status: "temporarilyClosed",
    });
    await k.w.affiliate(P.id, [R.id, S.id], S.id);
    const out = await list(k);
    expect(out.places?.items).toEqual([
      {
        placeId: P.id,
        cover: {
          source: "own",
          photoId: P.profile.photos.items[0]?.photoId,
          framing: null,
        },
        name: P.profile.name,
        address: P.profile.address,
        location: P.profile.location,
        region: "根津",
        standing: { kind: "place", operating: "temporarilyClosed" },
      },
    ]);
  });

  it("listMapTargets#5 範囲に、閉店した店舗がある / 読む", async () => {
    const k = await discoveryKit();
    const open = await placeAt(k.w, inCell(0, 0));
    await placeAt(k.w, inCell(1, 1), { status: "permanentlyClosed" });
    const out = await list(k);
    expect(placeIds(out)).toEqual([open.id]);
    expect(out.places?.count).toBe(1);
  });

  it("listMapTargets#6 条件に合う店舗が、1ページの件数より多い / 種類に店舗だけを指定して、2ページ目を読む", async () => {
    const k = await discoveryKit();
    const places = [];
    for (let i = 0; i < 5; i += 1) {
      places.push(await placeAt(k.w, inCell(i % 4, Math.floor(i / 4))));
    }
    await k.w.region();
    const first = await list(k, {
      kinds: "places",
      pagination: { page: 1, limit: 3 },
    });
    const second = await list(k, {
      kinds: "places",
      pagination: { page: 2, limit: 3 },
    });
    expect(second.regions).toBeNull();
    expect(placeIds(second)).toHaveLength(2);
    expect(second.places?.count).toBe(5);
    expect(
      [...(placeIds(first) ?? []), ...(placeIds(second) ?? [])].sort(),
    ).toEqual(places.map((place) => place.id).sort());
  });

  it("listMapTargets#7 範囲と条件に合う店舗も地域もない / 読む", async () => {
    const k = await discoveryKit();
    await placeAt(k.w, at(36.5, 140.5));
    const out = await list(k);
    expect(out.places).toEqual({ items: [], count: 0 });
    expect(out.regions).toEqual({ items: [], count: 0 });
  });
});
