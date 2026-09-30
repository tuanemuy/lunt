import type { GeoBounds } from "@repo/core/domain/common/geo";
import type { RegionId } from "@repo/core/domain/common/ids";
import { Geo } from "@repo/core/domain/discovery/geo";
import type { Place } from "@repo/core/domain/place/place";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import type { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import type { BrowseCriteriaInput } from "../criteria";
import { readMapCells } from "../readMapCells";
import type { PlaceCellView } from "../views";
import { type DiscoveryKit, discoveryKit } from "./kit";
import {
  at,
  BOUNDS,
  boundsInput,
  criteriaInput,
  GRID,
  inCell,
  NO_CRITERIA,
  OTEMACHI,
  placeAt,
  registeredAt,
} from "./mapKit";

const read = (
  k: DiscoveryKit,
  options: Readonly<{
    bounds?: GeoBounds;
    grid?: Readonly<{ columns: number; rows: number }>;
    criteria?: BrowseCriteriaInput;
    selectedRegionId?: RegionId | null;
  }> = {},
) =>
  readMapCells({
    container: k.container,
    input: {
      bounds: boundsInput(options.bounds ?? BOUNDS),
      grid: options.grid ?? GRID,
      criteria: options.criteria ?? NO_CRITERIA,
      selectedRegionId: options.selectedRegionId ?? null,
    },
  });

const shownIds = (cells: readonly PlaceCellView[]) =>
  cells.flatMap((cell) =>
    cell.kind === "single"
      ? [cell.place.placeId]
      : cell.kind === "colocated"
        ? cell.places.map((summary) => summary.placeId)
        : [],
  );

const regionIds = (out: Awaited<ReturnType<typeof read>>) =>
  out.regions.map((summary) => summary.regionId);

const ownCover = (place: Place) => {
  const [photo] = place.profile.photos.items;
  return photo === undefined
    ? null
    : { source: "own", photoId: photo.photoId, framing: null };
};

const placeSummary = (
  place: Place,
  region: Region | null = null,
  affiliated = false,
) => ({
  placeId: place.id,
  cover: ownCover(place),
  name: place.profile.name,
  address: place.profile.address,
  location: place.profile.location,
  region: region?.content.name ?? null,
  standing: { kind: "place", operating: place.operatingStatus },
  affiliated,
});

const inA = { profile: { address: SampleAddress.otemachi() } };
const inB = { profile: { address: SampleAddress.umeda() } };

describe("readMapCells", () => {
  it("readMapCells#1 範囲の中に、離れた位置の店舗 P・Q と地域 R がある。範囲の外に店舗 S がある / 条件なしで読む", async () => {
    const k = await discoveryKit();
    const P = await placeAt(k.w, inCell(0, 0), { photos: 1 });
    const Q = await placeAt(k.w, inCell(3, 2), { photos: 1 });
    await placeAt(k.w, at(36.5, 140.5), { photos: 1 });
    const R = await k.w.region({ location: inCell(1, 3) });
    const out = await read(k);
    expect(out.cells).toEqual([
      { kind: "single", column: 0, row: 0, place: placeSummary(P) },
      { kind: "single", column: 3, row: 2, place: placeSummary(Q) },
    ]);
    expect(out.regions).toEqual([
      {
        regionId: R.id,
        cover: {
          source: "own",
          photoId: R.content.photos.items[0]?.photoId,
          framing: null,
        },
        name: R.content.name,
        tagline: R.content.tagline,
        address: R.content.address,
        location: R.content.location,
      },
    ]);
    expect(out.selectedRegion).toBeNull();
    expect(Object.keys(out.photos).sort()).toEqual(
      [
        ...[P, Q].map((place) => place.profile.photos.items[0]?.photoId),
        R.content.photos.items[0]?.photoId,
      ].sort(),
    );
  });

  it("readMapCells#2 範囲の中で、位置の違う店舗 P・Q が、同じ区画に入る近さにある / 読む", async () => {
    const k = await discoveryKit();
    const P = await placeAt(k.w, inCell(1, 1, 0.01, 0.01));
    const Q = await placeAt(k.w, inCell(1, 1, 0.04, 0.03));
    expect((await read(k)).cells).toEqual([
      {
        kind: "cluster",
        column: 1,
        row: 1,
        count: 2,
        affiliatedCount: 0,
        extent: Geo.extentOf([P.profile.location, Q.profile.location]),
      },
    ]);
  });

  it("readMapCells#3 上の結果のまとまりの範囲を、次の範囲にする / 列も行も2以上の格子で読む", async () => {
    const k = await discoveryKit();
    const P = await placeAt(k.w, inCell(1, 1, 0.01, 0.01));
    const Q = await placeAt(k.w, inCell(1, 1, 0.04, 0.03));
    const [cluster] = (await read(k)).cells;
    if (cluster?.kind !== "cluster") throw new Error("a cluster");
    const split = await read(k, {
      bounds: cluster.extent,
      grid: { columns: 2, rows: 2 },
    });
    expect(split.cells).toEqual([
      { kind: "single", column: 0, row: 0, place: placeSummary(P) },
      { kind: "single", column: 1, row: 1, place: placeSummary(Q) },
    ]);
  });

  it("readMapCells#4 同じ建物のテナントの店舗 P・Q・T が、同じ位置にある / 読む", async () => {
    const k = await discoveryKit();
    const spot = inCell(2, 2);
    const P = await registeredAt(k, new Date("2026-06-01T00:00:00Z"), spot);
    const Q = await registeredAt(k, new Date("2026-06-02T00:00:00Z"), spot);
    const T = await registeredAt(k, new Date("2026-06-03T00:00:00Z"), spot);
    expect((await read(k)).cells).toEqual([
      {
        kind: "colocated",
        column: 2,
        row: 2,
        location: spot,
        places: [placeSummary(T), placeSummary(Q), placeSummary(P)],
      },
    ]);
  });

  it("readMapCells#5 同じ位置の店舗 P・Q と、少し離れた位置の店舗 T が、同じ区画に入る / 読む", async () => {
    const k = await discoveryKit();
    const spot = inCell(0, 3, 0.01, 0.01);
    const P = await placeAt(k.w, spot);
    const Q = await placeAt(k.w, spot);
    const T = await placeAt(k.w, inCell(0, 3, 0.03, 0.04));
    const [cluster] = (await read(k)).cells;
    expect(cluster).toMatchObject({ kind: "cluster", count: 3 });
    if (cluster?.kind !== "cluster") throw new Error("a cluster");
    expect((await read(k, { bounds: cluster.extent })).cells).toEqual([
      {
        kind: "colocated",
        column: 0,
        row: 0,
        location: spot,
        places: [placeSummary(P), placeSummary(Q)],
      },
      { kind: "single", column: 3, row: 3, place: placeSummary(T) },
    ]);
  });

  it("readMapCells#6 休業中の店舗 P が、1件の店舗の区画にある / 読む", async () => {
    const k = await discoveryKit();
    const P = await placeAt(k.w, inCell(1, 2), {
      photos: 1,
      status: "temporarilyClosed",
    });
    const [cell] = (await read(k)).cells;
    if (cell?.kind !== "single") throw new Error("a single cell");
    expect(cell.place).toEqual(placeSummary(P));
    expect(cell.place.standing).toEqual({
      kind: "place",
      operating: "temporarilyClosed",
    });
    expect(cell.place.cover).not.toBeNull();
  });

  it("readMapCells#7 閉店した店舗と、非公開の店舗が範囲にある / 読む", async () => {
    const k = await discoveryKit();
    const P = await placeAt(k.w, inCell(1, 1, 0.01, 0.01));
    await placeAt(k.w, inCell(1, 1, 0.03, 0.03), {
      status: "permanentlyClosed",
    });
    await placeAt(k.w, inCell(1, 1, 0.04, 0.02), { suspended: true });
    await placeAt(k.w, inCell(3, 3), { status: "permanentlyClosed" });
    expect((await read(k)).cells).toEqual([
      { kind: "single", column: 1, row: 1, place: placeSummary(P) },
    ]);
  });

  it("readMapCells#8 写真のない店舗 P に、写真のある閲覧できる掲載がある / 読む", async () => {
    const k = await discoveryKit();
    const P = await placeAt(k.w, inCell(2, 1));
    const L = await k.w.available(P.id);
    const [cell] = (await read(k)).cells;
    if (cell?.kind !== "single") throw new Error("a single cell");
    const [photo] = L.content.photos.items;
    expect(cell.place.cover).toEqual({
      source: "listing",
      listingId: L.id,
      photoId: photo.photoId,
      framing: photo.framing,
    });
  });

  it("readMapCells#9 範囲に、選択エリアの中の店舗 P と外の店舗 Q、位置が選択エリアにある地域 R1、位置は外で所属する店舗の所在地が選択エリアにある地域 R2、どちらも外の地域 R3 がある / エリアを選んで読む", async () => {
    const k = await discoveryKit();
    const P = await placeAt(k.w, inCell(0, 0), inA);
    await placeAt(k.w, inCell(3, 3), inB);
    const R1 = await k.w.region({
      location: inCell(1, 0),
      content: { address: SampleAddress.otemachi() },
    });
    const R2 = await k.w.region({
      location: inCell(2, 0),
      content: { address: SampleAddress.umeda() },
    });
    await k.w.region({
      location: inCell(3, 0),
      content: { address: SampleAddress.umeda() },
    });
    const member = await placeAt(k.w, at(36.5, 140.5), inA);
    await k.w.affiliate(member.id, [R2.id]);
    const out = await read(k, {
      criteria: criteriaInput({ areas: [OTEMACHI] }),
    });
    expect(shownIds(out.cells)).toEqual([P.id]);
    expect(regionIds(out)).toEqual([R2.id, R1.id]);
    expect(out.effective).toEqual({
      areas: [{ unit: "area", areaCode: "1000004" }],
      categoryIds: [],
    });
  });

  it("readMapCells#10 店舗 P は「食べる」の提供中の掲載を持つ。店舗 Q の「食べる」の掲載は提供終了だけ。店舗 T は掲載を持たない。地域 R がある / カテゴリー「食べる」を選んで読む", async () => {
    const k = await discoveryKit();
    const [eat] = k.categoryIds;
    if (eat === undefined) throw new Error("食べる");
    const P = await placeAt(k.w, inCell(0, 0));
    const Q = await placeAt(k.w, inCell(1, 1));
    await placeAt(k.w, inCell(2, 2));
    await k.w.available(P.id);
    await k.w.endedBySchedule(Q.id);
    const R = await k.w.region({ location: inCell(3, 3) });
    const out = await read(k, {
      criteria: criteriaInput({ categoryIds: [eat] }),
    });
    expect(shownIds(out.cells)).toEqual([P.id]);
    expect(regionIds(out)).toEqual([R.id]);
    expect(out.effective).toEqual({ areas: [], categoryIds: [eat] });
  });

  /**
   * R (located outside 大手町) with P (梅田, no listing) and the closed Q;
   * a matching place M elsewhere. Criteria: 大手町 and 食べる.
   */
  async function selectedRegionWorld(k: DiscoveryKit) {
    const [eat] = k.categoryIds;
    if (eat === undefined) throw new Error("食べる");
    const R = await k.w.region({
      name: "谷中",
      location: inCell(3, 0),
      content: { address: SampleAddress.umeda() },
    });
    const P = await placeAt(k.w, inCell(0, 0), inB);
    const Q = await placeAt(k.w, inCell(1, 0), {
      ...inB,
      status: "permanentlyClosed",
    });
    await k.w.affiliate(P.id, [R.id]);
    await k.w.affiliate(Q.id, [R.id]);
    const M = await placeAt(k.w, inCell(3, 3), inA);
    await k.w.available(M.id);
    const criteria = criteriaInput({ areas: [OTEMACHI], categoryIds: [eat] });
    return { R, P, Q, M, criteria };
  }

  it("readMapCells#11 地域 R に、条件に合わない店舗 P と、閉店した店舗 Q が所属している。R の位置は選択エリアの外 / エリアとカテゴリーを選び、R を選んでいる地域にして読む", async () => {
    const k = await discoveryKit();
    const { R, P, M, criteria } = await selectedRegionWorld(k);
    const out = await read(k, { criteria, selectedRegionId: R.id });
    expect(out.cells).toEqual([
      { kind: "single", column: 0, row: 0, place: placeSummary(P, R, true) },
      {
        kind: "single",
        column: 3,
        row: 3,
        place: expect.objectContaining({
          placeId: M.id,
          region: null,
          affiliated: false,
        }),
      },
    ]);
    expect(out.selectedRegion?.regionId).toBe(R.id);
    expect(regionIds(out)).toEqual([]);
  });

  it("readMapCells#12 上と同じ / 選んでいる地域を null にして、同じ範囲と条件で読む", async () => {
    const k = await discoveryKit();
    const { M, criteria } = await selectedRegionWorld(k);
    const out = await read(k, { criteria });
    expect(shownIds(out.cells)).toEqual([M.id]);
    expect(out.selectedRegion).toBeNull();
  });

  it("readMapCells#13 選んでいる地域が、公開を取り下げられている / その地域を選んでいる地域にして読む", async () => {
    const k = await discoveryKit();
    const { R, M, criteria } = await selectedRegionWorld(k);
    await k.w.unpublishRegion(R);
    const out = await read(k, { criteria, selectedRegionId: R.id });
    expect(out.selectedRegion).toBeNull();
    expect(shownIds(out.cells)).toEqual([M.id]);
  });

  it("marks a place of the selected region whose displayed region is another of its regions", async () => {
    const k = await discoveryKit();
    const R = await k.w.region({ name: "谷中", location: inCell(3, 0) });
    const S = await k.w.region({ name: "根津", location: inCell(3, 1) });
    const P = await placeAt(k.w, inCell(0, 0));
    await k.w.affiliate(P.id, [R.id, S.id], S.id);
    const spot = inCell(2, 2);
    const Q = await placeAt(k.w, spot);
    const T = await placeAt(k.w, spot);
    await k.w.affiliate(Q.id, [S.id, R.id]);
    const selected = await read(k, { selectedRegionId: R.id });
    expect(selected.cells).toEqual([
      { kind: "single", column: 0, row: 0, place: placeSummary(P, S, true) },
      {
        kind: "colocated",
        column: 2,
        row: 2,
        location: spot,
        places: [placeSummary(Q, S, true), placeSummary(T, null, false)],
      },
    ]);
    const unselected = await read(k);
    expect(unselected.cells).toEqual([
      { kind: "single", column: 0, row: 0, place: placeSummary(P, S) },
      {
        kind: "colocated",
        column: 2,
        row: 2,
        location: spot,
        places: [placeSummary(Q, S), placeSummary(T)],
      },
    ]);
  });

  it("readMapCells#14 範囲と条件に合う店舗も地域もない / 読む", async () => {
    const k = await discoveryKit();
    await placeAt(k.w, at(36.5, 140.5));
    await k.w.region({ location: at(36.5, 140.6) });
    const out = await read(k);
    expect(out.cells).toEqual([]);
    expect(out.regions).toEqual([]);
    expect(out.photos).toEqual({});
  });
});
