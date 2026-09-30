import type { AreaCode } from "@repo/core/domain/common/areaCode";
import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import type {
  CategoryId,
  OccasionId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { RegionId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { ResolvedCriteria } from "@repo/core/domain/discovery/browseCriteria";
import { Geo, MapGrid } from "@repo/core/domain/discovery/geo";
import {
  MapClustering,
  type PlaceCell,
} from "@repo/core/domain/discovery/mapClustering";
import { Vicinity } from "@repo/core/domain/discovery/vicinity";
import { Listing } from "@repo/core/domain/listing/listing";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { Place } from "@repo/core/domain/place/place";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import {
  type DiscoveryHarness,
  type DiscoveryHarnessFactory,
  type DiscoveryWorld,
  discoveryWorld,
  listingIdsOf,
  PERIODS,
  type PlaceSpec,
  TODAY,
} from "./discoveryFixtures";
import { day, period } from "./listingFixtures";
import { insertOccasions } from "./occasionFixtures";
import { insertPlaces, newPlace, PLACE_T0 } from "./placeFixtures";
import {
  insertAffiliations,
  insertRegions,
  regionContent,
} from "./regionFixtures";

const PAGE = { page: 1, limit: 10 } as const;
const UNKNOWN_REGION = RegionId.create("ffffffff-ffff-7fff-8fff-00000ffffffd");

type Page = Readonly<{ page: number; limit: number }>;

const at = (latitude: number, longitude: number): GeoPoint =>
  GeoPoint.create(latitude, longitude);

const rect = (south: number, west: number, north: number, east: number) =>
  GeoBounds.create(at(south, west), at(north, east));

/**
 * Holds every default fixture spot (places 35.6848, 139.7639; regions
 * 35.7266, 139.7669). With `GRID` its cells are 0.05° squares.
 */
const BOUNDS = rect(35.6, 139.7, 35.8, 139.9);
const GRID = MapGrid.create(4, 4);

/** A spot inside cell (`column`, `row`) of `BOUNDS` × `GRID`, offset in that cell. */
const inCell = (column: number, row: number, dx = 0.025, dy = 0.025) =>
  at(35.6 + 0.05 * row + dy, 139.7 + 0.05 * column + dx);

const DEGREES_PER_METRE = 180 / (Math.PI * 6_371_000);

/** `metres` due north (south when negative) of `origin`. */
const northOf = (origin: GeoPoint, metres: number) =>
  at(origin.latitude + metres * DEGREES_PER_METRE, origin.longitude);

const AREA_A = SampleAddress.otemachi().areaCode;

const criteriaOf = (
  spec: Readonly<{
    areaCodes?: readonly AreaCode[];
    categoryIds?: readonly CategoryId[];
  }> = {},
): ResolvedCriteria => ({
  areaCodes: spec.areaCodes === undefined ? null : new Set(spec.areaCodes),
  categoryIds:
    spec.categoryIds === undefined ? null : new Set(spec.categoryIds),
  effective: { areas: [], categoryIds: [] },
});

const placeIdsOf = (entries: readonly Readonly<{ place: Place }>[]) =>
  entries.map((entry) => entry.place.id);

/**
 * `ExplorationQueries` contract (`spec/testcases/ports/explorationQueries.md`).
 * The article list (`findArticles`) rows stay `todo` until stage 5.
 */
export function describeExplorationQueriesContract(
  makeHarness: DiscoveryHarnessFactory,
): void {
  describe("ExplorationQueries contract", () => {
    const setup = async () => {
      const h = await makeHarness();
      return { h, w: discoveryWorld(h) };
    };

    const placesOf = (
      h: DiscoveryHarness,
      regionId: RegionId,
      pagination: Page = PAGE,
    ) => h.explorationQueries.findPlacesOfRegion(regionId, pagination);

    const listingsOf = (
      h: DiscoveryHarness,
      regionId: RegionId,
      options: Readonly<{
        excludingPlaceId?: PlaceId | null;
        pagination?: Page;
        today?: LocalDate;
      }> = {},
    ) =>
      h.explorationQueries.findListingsOfRegion(
        {
          regionId,
          excludingPlaceId: options.excludingPlaceId ?? null,
          today: options.today ?? TODAY,
        },
        options.pagination ?? PAGE,
      );

    /** Places affiliated with the region one after another (oldest first). */
    const members = async (
      w: ReturnType<typeof discoveryWorld>,
      region: Region,
      count: number,
    ) => {
      const places: Place[] = [];
      for (let i = 0; i < count; i += 1) {
        const place = await w.place();
        await w.affiliate(place.id, [region.id]);
        places.push(place);
      }
      return places;
    };

    const newestFirst = (listings: readonly Listing[]) =>
      listings.map((listing) => listing.id).reverse();

    const cellsOf = (
      h: DiscoveryHarness,
      options: Readonly<{
        bounds?: GeoBounds;
        grid?: MapGrid;
        criteria?: ResolvedCriteria;
        selectedRegionId?: RegionId | null;
        today?: LocalDate;
      }> = {},
    ) =>
      h.explorationQueries.findPlaceCells({
        bounds: options.bounds ?? BOUNDS,
        grid: options.grid ?? GRID,
        criteria: options.criteria ?? criteriaOf(),
        selectedRegionId: options.selectedRegionId ?? null,
        today: options.today ?? TODAY,
      });

    const inBounds = (
      h: DiscoveryHarness,
      options: Readonly<{
        bounds?: GeoBounds;
        criteria?: ResolvedCriteria;
        origin?: GeoPoint | null;
        today?: LocalDate;
        pagination?: Page;
      }> = {},
    ) =>
      h.explorationQueries.findPlacesInBounds(
        {
          bounds: options.bounds ?? BOUNDS,
          criteria: options.criteria ?? criteriaOf(),
          origin: options.origin ?? null,
          today: options.today ?? TODAY,
        },
        options.pagination ?? PAGE,
      );

    const regionsOf = (
      h: DiscoveryHarness,
      options: Readonly<{
        bounds?: GeoBounds | null;
        areaCodes?: ReadonlySet<AreaCode> | null;
        vicinity?: Vicinity | null;
        origin?: GeoPoint | null;
        pagination?: Page;
      }> = {},
    ) =>
      h.explorationQueries.findRegions(
        {
          bounds: options.bounds ?? null,
          areaCodes: options.areaCodes ?? null,
          vicinity: options.vicinity ?? null,
          origin: options.origin ?? null,
        },
        options.pagination ?? PAGE,
      );

    const occasionsOf = (
      h: DiscoveryHarness,
      options: Readonly<{ today?: LocalDate; pagination?: Page }> = {},
    ) =>
      h.explorationQueries.findOccasions(
        options.today ?? TODAY,
        options.pagination ?? PAGE,
      );

    const placesExtent = (
      h: DiscoveryHarness,
      areaCodes: ReadonlySet<AreaCode> | null = null,
    ) => h.explorationQueries.findMapExtent({ kind: "places", areaCodes });

    const regionExtent = (h: DiscoveryHarness, regionId: RegionId) =>
      h.explorationQueries.findMapExtent({ kind: "region", regionId });

    /** A place at `location` (open, no photo unless `spec` says otherwise). */
    const placeAt = (
      w: DiscoveryWorld,
      location: GeoPoint,
      spec: PlaceSpec = {},
    ) =>
      w.place({
        ...spec,
        profile: {
          ...spec.profile,
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
        },
      });

    /** A place registered at `registeredAt`, at `location` (default: the fixtures' spot). */
    const registeredAt = async (
      w: DiscoveryWorld,
      h: DiscoveryHarness,
      at: Date,
      location?: GeoPoint,
    ) => {
      const place = newPlace(
        w.f.place(),
        location === undefined
          ? {}
          : {
              location: {
                latitude: location.latitude,
                longitude: location.longitude,
              },
            },
        at,
      );
      await insertPlaces(h, place);
      return place;
    };

    /** Every place id the cells show individually (single and colocated). */
    const shownIds = (cells: readonly PlaceCell[]) =>
      cells.flatMap((cell) =>
        cell.kind === "single"
          ? [cell.place.place.id]
          : cell.kind === "colocated"
            ? cell.places.map((entry) => entry.place.id)
            : [],
      );

    /** How many places the cells hold. */
    const placeCount = (cells: readonly PlaceCell[]) =>
      cells.reduce(
        (sum, cell) =>
          sum +
          (cell.kind === "single"
            ? 1
            : cell.kind === "cluster"
              ? cell.count
              : cell.places.length),
        0,
      );

    const regionIdsOf = (regions: readonly Readonly<{ id: RegionId }>[]) =>
      regions.map((region) => region.id);

    const occasionIdsOf = (
      occasions: readonly Readonly<{ id: OccasionId }>[],
    ) => occasions.map((occasion) => occasion.id);

    describe("findPlaceCells の対象", () => {
      it("explorationQueries#1 店舗が1つもない / findPlaceCells を呼ぶ", async () => {
        const { h } = await setup();
        expect(await cellsOf(h)).toEqual([]);
      });

      it("explorationQueries#2 bounds の内側に店舗 P、外側に店舗 S / findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await placeAt(w, inCell(1, 2));
        await placeAt(w, at(36.5, 140.5));
        expect(await cellsOf(h)).toEqual([
          { kind: "single", column: 1, row: 2, place: w.entryOf(P) },
        ]);
      });

      it("explorationQueries#3 店舗 P の位置が、bounds の南西の角とちょうど同じ。店舗 Q の位置が、北東の角とちょうど同じ / findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await placeAt(w, BOUNDS.southWest);
        const Q = await placeAt(w, BOUNDS.northEast);
        expect(await cellsOf(h)).toEqual([
          { kind: "single", column: 0, row: 0, place: w.entryOf(P) },
          { kind: "single", column: 3, row: 3, place: w.entryOf(Q) },
        ]);
      });

      it("explorationQueries#4 休業中の店舗、閉店した店舗、非公開の店舗が bounds の内側にある / findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        const resting = await placeAt(w, inCell(0, 0), {
          status: "temporarilyClosed",
        });
        await placeAt(w, inCell(1, 1), { status: "permanentlyClosed" });
        await placeAt(w, inCell(2, 2), { suspended: true });
        expect(await cellsOf(h)).toEqual([
          { kind: "single", column: 0, row: 0, place: w.entryOf(resting) },
        ]);
      });

      it("explorationQueries#5 掲載を1件も持たない店舗と、写真のない店舗が bounds の内側にある / findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        const noListings = await placeAt(w, inCell(0, 0), { photos: 1 });
        const noPhoto = await placeAt(w, inCell(3, 3));
        const L = await w.available(noPhoto.id);
        expect(await cellsOf(h)).toEqual([
          { kind: "single", column: 0, row: 0, place: w.entryOf(noListings) },
          { kind: "single", column: 3, row: 3, place: w.entryOf(noPhoto, [L]) },
        ]);
      });

      it("explorationQueries#6 所在地の areaCode が A の店舗 Pa と、B の店舗 Pb / areaCodes: {A} で呼ぶ", async () => {
        const { h, w } = await setup();
        const Pa = await placeAt(w, inCell(0, 0), {
          profile: { address: SampleAddress.otemachi() },
        });
        await placeAt(w, inCell(1, 1), {
          profile: { address: SampleAddress.umeda() },
        });
        expect(
          shownIds(
            await cellsOf(h, { criteria: criteriaOf({ areaCodes: [AREA_A] }) }),
          ),
        ).toEqual([Pa.id]);
      });

      it("explorationQueries#7 店舗 P1 は K1 の提供中の掲載を持つ。店舗 P2 の K1 の掲載は、提供開始前と提供終了だけ。店舗 P3 の K1 の掲載は unpublished。店舗 P4 は K2 の提供中の掲載だけを持つ。店舗 P5 は掲載を持たない / categoryIds: {K1} で呼ぶ", async () => {
        const { h, w } = await setup();
        const K1 = w.f.category();
        const K2 = w.f.category();
        const [P1, P2, P3, P4] = [
          await placeAt(w, inCell(0, 0)),
          await placeAt(w, inCell(1, 0)),
          await placeAt(w, inCell(2, 0)),
          await placeAt(w, inCell(3, 0)),
        ];
        await placeAt(w, inCell(0, 1));
        await w.store(w.f.published(P1.id, { categoryId: K1 }));
        await w.store(
          w.f.published(P2.id, {
            categoryId: K1,
            offering: period("2026-07-20", null),
          }),
        );
        await w.store(
          w.f.published(P2.id, {
            categoryId: K1,
            offering: period(null, "2026-07-01"),
          }),
        );
        await w.store(w.f.unpublished(P3.id, { categoryId: K1 }));
        await w.store(w.f.published(P4.id, { categoryId: K2 }));
        expect(
          shownIds(
            await cellsOf(h, { criteria: criteriaOf({ categoryIds: [K1] }) }),
          ),
        ).toEqual([P1.id]);
      });

      it("explorationQueries#8 店舗 P に、content.categoryId が廃止された K のままの提供中の掲載がある。K の移行先は M / categoryIds: {M, K} で呼ぶ", async () => {
        const { h, w } = await setup();
        const K = w.f.category();
        const M = w.f.category();
        const P = await placeAt(w, inCell(0, 0));
        await w.store(w.f.published(P.id, { categoryId: K }));
        expect(
          shownIds(
            await cellsOf(h, {
              criteria: criteriaOf({ categoryIds: [M, K] }),
            }),
          ),
        ).toEqual([P.id]);
      });

      it("explorationQueries#9 areaCode A で K1 の提供中の掲載を持つ店舗 P1、A で K1 の掲載を持たない店舗 P2、B で K1 の提供中の掲載を持つ店舗 P3 / areaCodes: {A}・categoryIds: {K1} で呼ぶ", async () => {
        const { h, w } = await setup();
        const K1 = w.f.category();
        const inA = { profile: { address: SampleAddress.otemachi() } };
        const P1 = await placeAt(w, inCell(0, 0), inA);
        const P2 = await placeAt(w, inCell(1, 1), inA);
        const P3 = await placeAt(w, inCell(2, 2), {
          profile: { address: SampleAddress.umeda() },
        });
        await w.store(w.f.published(P1.id, { categoryId: K1 }));
        await w.store(w.f.published(P2.id));
        await w.store(w.f.published(P3.id, { categoryId: K1 }));
        expect(
          shownIds(
            await cellsOf(h, {
              criteria: criteriaOf({ areaCodes: [AREA_A], categoryIds: [K1] }),
            }),
          ),
        ).toEqual([P1.id]);
      });

      it("explorationQueries#10 K1 の提供期間の開始が 5/10 の掲載だけを持つ店舗 P / categoryIds: {K1} で、today を 5/9 にして呼ぶ。別に 5/10 にして呼ぶ", async () => {
        const { h, w } = await setup();
        const K1 = w.f.category();
        const P = await placeAt(w, inCell(0, 0));
        await w.store(
          w.f.published(P.id, {
            categoryId: K1,
            offering: period("2026-05-10", null),
          }),
        );
        const criteria = criteriaOf({ categoryIds: [K1] });
        expect(
          await cellsOf(h, { criteria, today: day("2026-05-09") }),
        ).toEqual([]);
        expect(
          shownIds(await cellsOf(h, { criteria, today: day("2026-05-10") })),
        ).toEqual([P.id]);
      });
    });

    describe("findPlaceCells の区画", () => {
      it("explorationQueries#11 店舗 P が1件だけ、ある区画にある / findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await placeAt(w, inCell(2, 1));
        expect(await cellsOf(h)).toEqual([
          { kind: "single", column: 2, row: 1, place: w.entryOf(P) },
        ]);
      });

      it("explorationQueries#12 位置の違う店舗 P・Q が、同じ区画にある / findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await placeAt(w, inCell(1, 1, 0.01, 0.01));
        const Q = await placeAt(w, inCell(1, 1, 0.04, 0.03));
        expect(await cellsOf(h)).toEqual([
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

      it("explorationQueries#13 上の結果の extent を次の bounds にする / 同じ grid で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await placeAt(w, inCell(1, 1, 0.01, 0.01));
        const Q = await placeAt(w, inCell(1, 1, 0.04, 0.03));
        const [cluster] = await cellsOf(h);
        if (cluster?.kind !== "cluster") throw new Error("a cluster");
        const split = await cellsOf(h, { bounds: cluster.extent });
        expect(split).toEqual(
          MapClustering.cells(
            cluster.extent,
            GRID,
            [w.entryOf(P), w.entryOf(Q)],
            null,
          ),
        );
        expect(split.map((cell) => cell.kind)).toEqual(["single", "single"]);
        expect(shownIds(split)).toEqual([P.id, Q.id]);
      });

      const colocatedTrio = async (w: DiscoveryWorld, h: DiscoveryHarness) => {
        const spot = inCell(2, 2);
        const P = await registeredAt(
          w,
          h,
          new Date("2026-09-01T00:00:00Z"),
          spot,
        );
        const Q = await registeredAt(
          w,
          h,
          new Date("2026-09-02T00:00:00Z"),
          spot,
        );
        const T = await registeredAt(
          w,
          h,
          new Date("2026-09-03T00:00:00Z"),
          spot,
        );
        return { spot, P, Q, T };
      };

      it("explorationQueries#14 同じ位置の店舗 P・Q・T（registeredAt は T1 < T2 < T3）が、同じ区画にある / findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        const { spot, P, Q, T } = await colocatedTrio(w, h);
        expect(await cellsOf(h)).toEqual([
          {
            kind: "colocated",
            column: 2,
            row: 2,
            location: spot,
            places: [w.entryOf(T), w.entryOf(Q), w.entryOf(P)],
          },
        ]);
      });

      it("explorationQueries#15 上と同じ / その位置だけの矩形（南西と北東がどちらもその位置）を bounds にして呼ぶ", async () => {
        const { h, w } = await setup();
        const { spot, P, Q, T } = await colocatedTrio(w, h);
        expect(
          await cellsOf(h, { bounds: GeoBounds.create(spot, spot) }),
        ).toEqual([
          {
            kind: "colocated",
            column: 0,
            row: 0,
            location: spot,
            places: [w.entryOf(T), w.entryOf(Q), w.entryOf(P)],
          },
        ]);
      });

      it("explorationQueries#16 同じ位置の店舗 P・Q と、位置の違う店舗 S が、同じ区画にある / findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        const spot = inCell(0, 3, 0.01, 0.01);
        await placeAt(w, spot);
        await placeAt(w, spot);
        await placeAt(w, inCell(0, 3, 0.04, 0.04));
        const cells = await cellsOf(h);
        expect(cells).toHaveLength(1);
        expect(cells[0]).toMatchObject({
          kind: "cluster",
          column: 0,
          row: 3,
          count: 3,
        });
      });

      it("explorationQueries#17 店舗が、区画（column: 2・row: 0）、（column: 0・row: 1）、（column: 3・row: 1）に1件ずつある / findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        await placeAt(w, inCell(3, 1));
        await placeAt(w, inCell(0, 1));
        await placeAt(w, inCell(2, 0));
        expect(
          (await cellsOf(h)).map((cell) => [cell.column, cell.row]),
        ).toEqual([
          [2, 0],
          [0, 1],
          [3, 1],
        ]);
      });

      it("explorationQueries#18 bounds の内側に、位置の違う店舗が30件ある / grid を 1 × 1 にして呼ぶ", async () => {
        const { h, w } = await setup();
        for (let i = 0; i < 30; i += 1) {
          await placeAt(w, at(35.61 + i * 0.005, 139.71 + i * 0.004));
        }
        const cells = await cellsOf(h, { grid: MapGrid.create(1, 1) });
        expect(cells).toHaveLength(1);
        expect(cells[0]).toMatchObject({
          kind: "cluster",
          column: 0,
          row: 0,
          count: 30,
        });
      });

      it("explorationQueries#19 同じ経度に店舗 P・Q があり、bounds は幅が 0（西端と東端がその経度） / findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await placeAt(w, at(35.61, 139.75));
        const Q = await placeAt(w, at(35.79, 139.75));
        expect(
          await cellsOf(h, { bounds: rect(35.6, 139.75, 35.8, 139.75) }),
        ).toEqual([
          { kind: "single", column: 0, row: 0, place: w.entryOf(P) },
          { kind: "single", column: 0, row: 3, place: w.entryOf(Q) },
        ]);
      });

      it("explorationQueries#20 写真のない店舗 P に、提供中の掲載がある。P だけの区画 / findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await placeAt(w, inCell(1, 1));
        const L = await w.available(P.id);
        const [cell] = await cellsOf(h);
        if (cell?.kind !== "single") throw new Error("a single cell");
        expect(cell.place).toEqual(w.entryOf(P, [L]));
        expect(cell.place.substituteCover).toEqual({
          listingId: L.id,
          photo: L.content.photos.items[0],
        });
      });
    });

    describe("findPlaceCells の選んでいる地域", () => {
      const inA = { profile: { address: SampleAddress.otemachi() } };
      const inB = { profile: { address: SampleAddress.umeda() } };
      const onlyA = criteriaOf({ areaCodes: [AREA_A] });

      /** R; P in R outside the criteria at (0, 0); Q matching, not in R, at (3, 3). */
      const outsiderAndMatch = async (w: DiscoveryWorld) => {
        const R = await w.region();
        const P = await placeAt(w, inCell(0, 0), inB);
        const Q = await placeAt(w, inCell(3, 3), inA);
        const ofP = await w.affiliate(P.id, [R.id]);
        return { R, P, Q, ofP };
      };

      it("explorationQueries#21 公開中の地域 R に所属する店舗 P は、criteria に合わない。店舗 Q は criteria に合い、R に所属しない。P と Q は別々の区画 / selectedRegionId: R と、その criteria で呼ぶ", async () => {
        const { h, w } = await setup();
        const { R, P, Q, ofP } = await outsiderAndMatch(w);
        const entryOfP = w.entryOf(P, [], { affiliations: ofP, regions: [R] });
        const cells = await cellsOf(h, {
          criteria: onlyA,
          selectedRegionId: R.id,
        });
        expect(cells).toEqual([
          { kind: "single", column: 0, row: 0, place: entryOfP },
          { kind: "single", column: 3, row: 3, place: w.entryOf(Q) },
        ]);
        expect(regionIdsOf(entryOfP.regions)).toEqual([R.id]);
      });

      it("explorationQueries#22 上と同じ / selectedRegionId: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const { Q } = await outsiderAndMatch(w);
        expect(await cellsOf(h, { criteria: onlyA })).toEqual([
          { kind: "single", column: 3, row: 3, place: w.entryOf(Q) },
        ]);
      });

      it("explorationQueries#23 R に所属し、criteria にも合う店舗 P / selectedRegionId: R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const P = await placeAt(w, inCell(1, 2), inA);
        const affiliations = await w.affiliate(P.id, [R.id]);
        expect(
          await cellsOf(h, { criteria: onlyA, selectedRegionId: R.id }),
        ).toEqual([
          {
            kind: "single",
            column: 1,
            row: 2,
            place: w.entryOf(P, [], { affiliations, regions: [R] }),
          },
        ]);
      });

      it("explorationQueries#24 R に所属する店舗 P・Q と、所属しない店舗 S が、位置の違う店舗として同じ区画にある。どれも criteria に合う / selectedRegionId: R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const P = await placeAt(w, inCell(2, 1, 0.01, 0.01));
        const Q = await placeAt(w, inCell(2, 1, 0.02, 0.03));
        await placeAt(w, inCell(2, 1, 0.04, 0.02));
        await w.affiliate(P.id, [R.id]);
        await w.affiliate(Q.id, [R.id]);
        const cells = await cellsOf(h, { selectedRegionId: R.id });
        expect(cells).toHaveLength(1);
        expect(cells[0]).toMatchObject({
          kind: "cluster",
          count: 3,
          affiliatedCount: 2,
        });
      });

      it("explorationQueries#25 R に所属する店舗 P・Q と、所属しない店舗 S が、同じ位置にある。どれも criteria に合う / selectedRegionId: R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const spot = inCell(1, 1);
        const P = await placeAt(w, spot);
        const Q = await placeAt(w, spot);
        const S = await placeAt(w, spot);
        const ofP = await w.affiliate(P.id, [R.id]);
        const ofQ = await w.affiliate(Q.id, [R.id]);
        const cells = await cellsOf(h, { selectedRegionId: R.id });
        expect(cells).toEqual([
          {
            kind: "colocated",
            column: 1,
            row: 1,
            location: spot,
            places: [
              w.entryOf(P, [], { affiliations: ofP, regions: [R] }),
              w.entryOf(Q, [], { affiliations: ofQ, regions: [R] }),
              w.entryOf(S),
            ],
          },
        ]);
        const [cell] = cells;
        if (cell?.kind !== "colocated") throw new Error("a colocated cell");
        expect(cell.places.map((entry) => regionIdsOf(entry.regions))).toEqual([
          [R.id],
          [R.id],
          [],
        ]);
      });

      it("explorationQueries#26 R に所属する店舗 P・Q が、位置の違う店舗として同じ区画にある / selectedRegionId: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const P = await placeAt(w, inCell(3, 0, 0.01, 0.01));
        const Q = await placeAt(w, inCell(3, 0, 0.03, 0.04));
        await w.affiliate(P.id, [R.id]);
        await w.affiliate(Q.id, [R.id]);
        const cells = await cellsOf(h);
        expect(cells).toHaveLength(1);
        expect(cells[0]).toMatchObject({
          kind: "cluster",
          count: 2,
          affiliatedCount: 0,
        });
      });

      it("explorationQueries#27 R に、閉店した店舗と非公開の店舗が所属している / selectedRegionId: R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const closed = await placeAt(w, inCell(0, 0), {
          status: "permanentlyClosed",
        });
        const hidden = await placeAt(w, inCell(1, 1), { suspended: true });
        await w.affiliate(closed.id, [R.id]);
        await w.affiliate(hidden.id, [R.id]);
        expect(
          await cellsOf(h, { criteria: onlyA, selectedRegionId: R.id }),
        ).toEqual([]);
        expect(await cellsOf(h, { selectedRegionId: R.id })).toEqual([]);
      });

      it("explorationQueries#28 R に所属する店舗 P の位置が、bounds の外側 / selectedRegionId: R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const P = await placeAt(w, at(36.5, 140.5));
        await w.affiliate(P.id, [R.id]);
        expect(await cellsOf(h, { selectedRegionId: R.id })).toEqual([]);
      });

      it("explorationQueries#29 地域 R が unpublished、または運営による非公開。R に所属する店舗 P は criteria に合わず、R に所属する店舗 Q は criteria に合う / selectedRegionId: R で呼ぶ", async () => {
        for (const state of ["unpublished", "suspended"] as const) {
          const { h, w } = await setup();
          const R = await w.region({ state });
          const P = await placeAt(w, inCell(0, 0), inB);
          const Q = await placeAt(w, inCell(3, 3), inA);
          await w.affiliate(P.id, [R.id]);
          const ofQ = await w.affiliate(Q.id, [R.id]);
          const cells = await cellsOf(h, {
            criteria: onlyA,
            selectedRegionId: R.id,
          });
          expect(cells).toEqual([
            {
              kind: "single",
              column: 3,
              row: 3,
              place: w.entryOf(Q, [], { affiliations: ofQ, regions: [R] }),
            },
          ]);
          const [cell] = cells;
          if (cell?.kind !== "single") throw new Error("a single cell");
          expect(cell.place.regions).toEqual([]);
        }
      });

      it("explorationQueries#30 その ID の地域がない / その ID を selectedRegionId にして呼ぶ", async () => {
        const { h, w } = await setup();
        await outsiderAndMatch(w);
        expect(
          await cellsOf(h, {
            criteria: onlyA,
            selectedRegionId: UNKNOWN_REGION,
          }),
        ).toEqual(await cellsOf(h, { criteria: onlyA }));
      });
    });

    describe("findMapExtent", () => {
      it("explorationQueries#31 店舗が1つもない / places の範囲で、areaCodes: null で呼ぶ", async () => {
        const { h } = await setup();
        expect(await placesExtent(h)).toBeNull();
      });

      it("explorationQueries#32 店舗 P が1件だけ / places の範囲で、areaCodes: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const spot = at(35.1, 135.2);
        await placeAt(w, spot);
        expect(await placesExtent(h)).toEqual(GeoBounds.create(spot, spot));
      });

      it("explorationQueries#33 離れた位置に店舗 P・Q・S。さらに離れた位置に、閉店した店舗と非公開の店舗 / places の範囲で、areaCodes: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const spots = [at(35, 135), at(35.5, 139.5), at(34.2, 137)];
        for (const spot of spots) await placeAt(w, spot);
        await placeAt(w, at(43, 141.3), { status: "permanentlyClosed" });
        await placeAt(w, at(26.2, 127.7), { suspended: true });
        expect(await placesExtent(h)).toEqual(Geo.extentOf(spots));
      });

      it("explorationQueries#34 areaCode A の店舗 P・Q と、B の店舗 S / places の範囲で、areaCodes: {A} で呼ぶ", async () => {
        const { h, w } = await setup();
        const inA = { profile: { address: SampleAddress.otemachi() } };
        const P = await placeAt(w, at(35.68, 139.76), inA);
        const Q = await placeAt(w, at(35.69, 139.77), inA);
        await placeAt(w, at(34.7, 135.5), {
          profile: { address: SampleAddress.umeda() },
        });
        expect(await placesExtent(h, new Set([AREA_A]))).toEqual(
          Geo.extentOf([P.profile.location, Q.profile.location]),
        );
      });

      it("explorationQueries#35 areaCode A の店舗 P は掲載を持ち、同じ A の店舗 T は掲載を持たない / places の範囲で、areaCodes: {A} で呼ぶ", async () => {
        const { h, w } = await setup();
        const inA = { profile: { address: SampleAddress.otemachi() } };
        const P = await placeAt(w, at(35.68, 139.76), inA);
        const T = await placeAt(w, at(35.7, 139.79), inA);
        await w.available(P.id);
        expect(await placesExtent(h, new Set([AREA_A]))).toEqual(
          Geo.extentOf([P.profile.location, T.profile.location]),
        );
      });

      it("explorationQueries#36 areaCode A の店舗がない。または areaCodes が空の集合 / places の範囲で呼ぶ", async () => {
        const { h, w } = await setup();
        await placeAt(w, at(34.7, 135.5), {
          profile: { address: SampleAddress.umeda() },
        });
        expect(await placesExtent(h, new Set([AREA_A]))).toBeNull();
        expect(await placesExtent(h, new Set())).toBeNull();
      });

      it("explorationQueries#37 公開中の地域 R に、店舗 P・Q が所属している / region の範囲で R を指定して呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region({ location: at(35.72, 139.77) });
        const P = await placeAt(w, at(35.7, 139.8));
        const Q = await placeAt(w, at(35.75, 139.75));
        await placeAt(w, at(35.9, 139.9));
        await w.affiliate(P.id, [R.id]);
        await w.affiliate(Q.id, [R.id]);
        expect(await regionExtent(h, R.id)).toEqual(
          Geo.extentOf(
            [
              R.content.location,
              P.profile.location,
              Q.profile.location,
            ].flatMap((point) => (point === null ? [] : [point])),
          ),
        );
      });

      it("explorationQueries#38 公開中の地域 R に、所属する店舗がない / region の範囲で R を指定して呼ぶ", async () => {
        const { h, w } = await setup();
        const spot = at(35.72, 139.77);
        const R = await w.region({ location: spot });
        await placeAt(w, at(35.7, 139.8));
        expect(await regionExtent(h, R.id)).toEqual(
          GeoBounds.create(spot, spot),
        );
      });

      it("explorationQueries#39 公開中の地域 R に所属する店舗が、閉店した店舗と非公開の店舗だけ / region の範囲で R を指定して呼ぶ", async () => {
        const { h, w } = await setup();
        const spot = at(35.72, 139.77);
        const R = await w.region({ location: spot });
        const closed = await placeAt(w, at(35.7, 139.8), {
          status: "permanentlyClosed",
        });
        const hidden = await placeAt(w, at(35.6, 139.6), { suspended: true });
        await w.affiliate(closed.id, [R.id]);
        await w.affiliate(hidden.id, [R.id]);
        expect(await regionExtent(h, R.id)).toEqual(
          GeoBounds.create(spot, spot),
        );
      });

      it("explorationQueries#40 地域 R が unpublished、または運営による非公開。または、その ID の地域がない / region の範囲で呼ぶ", async () => {
        const { h, w } = await setup();
        const unpublished = await w.region({ state: "unpublished" });
        const suspended = await w.region({ state: "suspended" });
        const P = await w.place();
        await w.affiliate(P.id, [unpublished.id, suspended.id]);
        for (const id of [unpublished.id, suspended.id, UNKNOWN_REGION]) {
          expect(await regionExtent(h, id)).toBeNull();
        }
      });
    });

    describe("findPlacesInBounds", () => {
      it("explorationQueries#41 bounds の内側に、営業中の店舗、休業中の店舗、閉店した店舗、非公開の店舗。外側に営業中の店舗 / findPlacesInBounds を呼ぶ", async () => {
        const { h, w } = await setup();
        const open = await placeAt(w, inCell(0, 0));
        const resting = await placeAt(w, inCell(1, 1), {
          status: "temporarilyClosed",
        });
        await placeAt(w, inCell(2, 2), { status: "permanentlyClosed" });
        await placeAt(w, inCell(3, 3), { suspended: true });
        await placeAt(w, at(36.5, 140.5));
        expect(await inBounds(h)).toEqual({
          items: [w.entryOf(open), w.entryOf(resting)],
          count: 2,
        });
      });

      it("explorationQueries#42 店舗が混ざった前提で、areaCodes と categoryIds を持つ criteria / 同じ bounds・criteria・today で、findPlacesInBounds（limit: 100）と、selectedRegionId: null の findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        const K1 = w.f.category();
        const inA = { profile: { address: SampleAddress.otemachi() } };
        const inB = { profile: { address: SampleAddress.umeda() } };
        const spots = [
          inCell(0, 0, 0.01, 0.01),
          inCell(0, 0, 0.03, 0.04),
          inCell(1, 2),
          inCell(1, 2),
          inCell(1, 2),
          inCell(3, 3),
          inCell(2, 1),
        ];
        for (const [i, spot] of spots.entries()) {
          const place = await placeAt(w, spot, i === 6 ? inB : inA);
          if (i !== 4) {
            await w.store(w.f.published(place.id, { categoryId: K1 }));
          }
        }
        const closed = await placeAt(w, inCell(2, 3), {
          ...inA,
          status: "permanentlyClosed",
        });
        await w.store(w.f.published(closed.id, { categoryId: K1 }));
        const criteria = criteriaOf({ areaCodes: [AREA_A], categoryIds: [K1] });
        const listed = await inBounds(h, {
          criteria,
          pagination: { page: 1, limit: 100 },
        });
        const cells = await cellsOf(h, { criteria });
        expect(listed.count).toBe(placeCount(cells));
        expect(listed.count).toBe(5);
        const listedIds = listed.items.map((entry) => entry.place.id);
        for (const id of shownIds(cells)) expect(listedIds).toContain(id);
      });

      it("explorationQueries#43 店舗 P1・P2・P3 の registeredAt が T1 < T2 < T3 / origin: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const P1 = await registeredAt(w, h, new Date("2026-09-01T00:00:00Z"));
        const P3 = await registeredAt(w, h, new Date("2026-09-03T00:00:00Z"));
        const P2 = await registeredAt(w, h, new Date("2026-09-02T00:00:00Z"));
        expect(placeIdsOf((await inBounds(h)).items)).toEqual([
          P3.id,
          P2.id,
          P1.id,
        ]);
      });

      it("explorationQueries#44 registeredAt が同じ店舗が2つ / origin: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const moment = new Date("2026-09-01T00:00:00Z");
        const first = newPlace(w.f.place(), {}, moment);
        const second = newPlace(w.f.place(), {}, moment);
        await insertPlaces(h, second, first);
        expect(placeIdsOf((await inBounds(h)).items)).toEqual([
          first.id,
          second.id,
        ]);
      });

      it("explorationQueries#45 店舗 P1・P2・P3 の位置が、origin から 100 m・500 m・2 km。registeredAt は P3 が最も新しい / その origin で呼ぶ", async () => {
        const { h, w } = await setup();
        const origin = at(35.7, 139.8);
        const P1 = await registeredAt(
          w,
          h,
          new Date("2026-09-01T00:00:00Z"),
          northOf(origin, 100),
        );
        const P3 = await registeredAt(
          w,
          h,
          new Date("2026-09-03T00:00:00Z"),
          northOf(origin, -2000),
        );
        const P2 = await registeredAt(
          w,
          h,
          new Date("2026-09-02T00:00:00Z"),
          northOf(origin, 500),
        );
        expect(
          [P1, P2, P3].map((place) =>
            Geo.distanceMeters(origin, place.profile.location),
          ),
        ).toEqual([100, 500, 2000]);
        expect(placeIdsOf((await inBounds(h, { origin })).items)).toEqual([
          P1.id,
          P2.id,
          P3.id,
        ]);
      });

      it("explorationQueries#46 Geo.distanceMeters が同じになる2つの店舗。registeredAt が違う / origin つきで呼ぶ", async () => {
        const { h, w } = await setup();
        const origin = at(35.7, 139.8);
        const older = await registeredAt(
          w,
          h,
          new Date("2026-09-01T00:00:00Z"),
          northOf(origin, 300),
        );
        const newer = await registeredAt(
          w,
          h,
          new Date("2026-09-02T00:00:00Z"),
          northOf(origin, -300),
        );
        expect(Geo.distanceMeters(origin, older.profile.location)).toBe(
          Geo.distanceMeters(origin, newer.profile.location),
        );
        expect(placeIdsOf((await inBounds(h, { origin })).items)).toEqual([
          newer.id,
          older.id,
        ]);
      });

      it("explorationQueries#47 対象の店舗がない / findPlacesInBounds を呼ぶ", async () => {
        const { h, w } = await setup();
        await placeAt(w, at(36.5, 140.5));
        expect(await inBounds(h)).toEqual({ items: [], count: 0 });
      });

      it("explorationQueries#48 対象の店舗が1つ / findPlacesInBounds を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        expect(await inBounds(h)).toEqual({
          items: [w.entryOf(P)],
          count: 1,
        });
      });

      it("explorationQueries#49 対象の店舗が3つ / page: 1・limit: 3 で呼ぶ", async () => {
        const { h, w } = await setup();
        for (let i = 0; i < 3; i += 1) await w.place();
        const page = await inBounds(h, { pagination: { page: 1, limit: 3 } });
        expect(page.items).toHaveLength(3);
        expect(page.count).toBe(3);
      });

      it("explorationQueries#50 対象の店舗が5つ / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ", async () => {
        const { h, w } = await setup();
        const places: Place[] = [];
        for (let i = 0; i < 5; i += 1) places.push(await w.place());
        const pages = [
          await inBounds(h, { pagination: { page: 1, limit: 3 } }),
          await inBounds(h, { pagination: { page: 2, limit: 3 } }),
          await inBounds(h, { pagination: { page: 3, limit: 3 } }),
        ];
        expect(pages.map((p) => p.items.length)).toEqual([3, 2, 0]);
        expect(pages.map((p) => p.count)).toEqual([5, 5, 5]);
        expect(pages.flatMap((p) => placeIdsOf(p.items))).toEqual(
          places.map((place) => place.id),
        );
      });
    });

    describe("findRegions", () => {
      it("explorationQueries#51 地域が1つもない / findRegions を呼ぶ", async () => {
        const { h } = await setup();
        expect(await regionsOf(h)).toEqual({ items: [], count: 0 });
      });

      it("explorationQueries#52 published の地域 R1、draft の地域、unpublished の地域、published で運営による非公開の地域 / 条件をすべて null にして呼ぶ", async () => {
        const { h, w } = await setup();
        const R1 = await w.region();
        await w.region({ state: "draft" });
        await w.region({ state: "unpublished" });
        await w.region({ state: "suspended" });
        expect(await regionsOf(h)).toEqual({ items: [R1], count: 1 });
      });

      it("explorationQueries#53 所属する店舗を持たない公開中の地域と、所属する店舗に掲載がない公開中の地域 / 条件をすべて null にして呼ぶ", async () => {
        const { h, w } = await setup();
        const lonely = await w.region();
        const bare = await w.region();
        const P = await w.place();
        await w.affiliate(P.id, [bare.id]);
        expect(regionIdsOf((await regionsOf(h)).items)).toEqual([
          bare.id,
          lonely.id,
        ]);
      });

      it("explorationQueries#54 位置が bounds の内側の地域 R1、外側の地域 R2、bounds の北東の角とちょうど同じ位置の地域 R3 / その bounds で呼ぶ", async () => {
        const { h, w } = await setup();
        const R1 = await w.region({ location: inCell(1, 1) });
        await w.region({ location: at(36.5, 140.5) });
        const R3 = await w.region({ location: BOUNDS.northEast });
        expect(
          regionIdsOf((await regionsOf(h, { bounds: BOUNDS })).items),
        ).toEqual([R3.id, R1.id]);
      });

      it("explorationQueries#55 所在地の areaCode が A の地域 R1。所在地は B で、所属する営業中の店舗の所在地が A の地域 R2。所在地も所属する店舗の所在地も B の地域 R3 / areaCodes: {A} で呼ぶ", async () => {
        const { h, w } = await setup();
        const inB = { address: SampleAddress.umeda() };
        const R1 = await w.region({
          content: { address: SampleAddress.otemachi() },
        });
        const R2 = await w.region({ content: inB });
        const R3 = await w.region({ content: inB });
        const inA = await w.place({
          profile: { address: SampleAddress.otemachi() },
        });
        const alsoB = await w.place({ profile: inB });
        await w.affiliate(inA.id, [R2.id]);
        await w.affiliate(alsoB.id, [R3.id]);
        expect(
          regionIdsOf(
            (await regionsOf(h, { areaCodes: new Set([AREA_A]) })).items,
          ),
        ).toEqual([R2.id, R1.id]);
      });

      it("explorationQueries#56 所在地が B の地域 R に所属する、所在地が A の店舗が、非公開の店舗だけ / areaCodes: {A} で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region({
          content: { address: SampleAddress.umeda() },
        });
        const hidden = await w.place({
          suspended: true,
          profile: { address: SampleAddress.otemachi() },
        });
        await w.affiliate(hidden.id, [R.id]);
        expect(await regionsOf(h, { areaCodes: new Set([AREA_A]) })).toEqual({
          items: [],
          count: 0,
        });
      });

      it("explorationQueries#57 上の前提で、所在地が A の閉店した店舗が R に所属している。別に、所在地が A の休業中の店舗だけが所属する、所在地が B の地域 R' がある / areaCodes: {A} で呼ぶ", async () => {
        const { h, w } = await setup();
        const inB = { address: SampleAddress.umeda() };
        const inA = { address: SampleAddress.otemachi() };
        const R = await w.region({ content: inB });
        const hidden = await w.place({ suspended: true, profile: inA });
        const closed = await w.place({
          status: "permanentlyClosed",
          profile: inA,
        });
        await w.affiliate(hidden.id, [R.id]);
        await w.affiliate(closed.id, [R.id]);
        const Rp = await w.region({ content: inB });
        const resting = await w.place({
          status: "temporarilyClosed",
          profile: inA,
        });
        await w.affiliate(resting.id, [Rp.id]);
        expect(
          regionIdsOf(
            (await regionsOf(h, { areaCodes: new Set([AREA_A]) })).items,
          ),
        ).toEqual([Rp.id, R.id]);
      });

      it("explorationQueries#58 公開中の地域がある / areaCodes を空の集合にして呼ぶ", async () => {
        const { h, w } = await setup();
        await w.region();
        expect(await regionsOf(h, { areaCodes: new Set() })).toEqual({
          items: [],
          count: 0,
        });
      });

      it("explorationQueries#59 位置が vicinity.center から 900 m の地域 R1、ちょうど 1,000 m の地域 R2、1,100 m の地域 R3 / vicinity の radiusMeters を 1000 にして呼ぶ", async () => {
        const { h, w } = await setup();
        const center = at(35.7, 139.8);
        const R1 = await w.region({ location: northOf(center, 900) });
        const R2 = await w.region({ location: northOf(center, 1000) });
        const R3 = await w.region({ location: northOf(center, 1100) });
        expect(
          [R1, R2, R3].map((region) =>
            region.content.location === null
              ? null
              : Geo.distanceMeters(center, region.content.location),
          ),
        ).toEqual([900, 1000, 1100]);
        expect(
          regionIdsOf(
            (await regionsOf(h, { vicinity: Vicinity.create(center, 1000) }))
              .items,
          ),
        ).toEqual([R2.id, R1.id]);
      });

      it("explorationQueries#60 位置が vicinity.center から 5 km の地域 R4 に、800 m の閉店した店舗が所属している。5 km の地域 R5 に、800 m の非公開の店舗だけが所属している / radiusMeters を 1000 にして呼ぶ", async () => {
        const { h, w } = await setup();
        const center = at(35.7, 139.8);
        const R4 = await w.region({ location: northOf(center, 5000) });
        const R5 = await w.region({ location: northOf(center, -5000) });
        const closed = await placeAt(w, northOf(center, 800), {
          status: "permanentlyClosed",
        });
        const hidden = await placeAt(w, northOf(center, -800), {
          suspended: true,
        });
        await w.affiliate(closed.id, [R4.id]);
        await w.affiliate(hidden.id, [R5.id]);
        expect(
          regionIdsOf(
            (await regionsOf(h, { vicinity: Vicinity.create(center, 1000) }))
              .items,
          ),
        ).toEqual([R4.id]);
      });

      it("explorationQueries#61 bounds の内側で areaCode A の地域 R1、bounds の内側で B の地域 R2、bounds の外側で A の地域 R3 / その bounds と areaCodes: {A} で呼ぶ", async () => {
        const { h, w } = await setup();
        const inA = { address: SampleAddress.otemachi() };
        const R1 = await w.region({ location: inCell(0, 0), content: inA });
        await w.region({
          location: inCell(1, 1),
          content: { address: SampleAddress.umeda() },
        });
        await w.region({ location: at(36.5, 140.5), content: inA });
        expect(
          regionIdsOf(
            (
              await regionsOf(h, {
                bounds: BOUNDS,
                areaCodes: new Set([AREA_A]),
              })
            ).items,
          ),
        ).toEqual([R1.id]);
      });

      it("explorationQueries#62 地域 R1・R2・R3 の firstPublishedAt が T1 < T2 < T3。R1 は公開を取り下げた後、T3 より後に再び公開されている / origin: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const R1 = await w.region();
        const R2 = await w.region();
        const R3 = await w.region();
        await w.unpublishRegion(R1);
        await w.updateRegion(
          R1,
          (stored) => Region.publish(stored, w.f.tick()).entity,
        );
        expect(regionIdsOf((await regionsOf(h)).items)).toEqual([
          R3.id,
          R2.id,
          R1.id,
        ]);
      });

      it("explorationQueries#63 firstPublishedAt が同じ地域が2つ / origin: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const moment = w.f.tick();
        const [first, second] = [w.o.region(), w.o.region()].map(
          (id) =>
            Region.publish(
              Region.register(
                { id, content: regionContent({ photoIds: [w.o.photo()] }) },
                moment,
              ).entity,
              moment,
            ).entity,
        );
        if (first === undefined || second === undefined) {
          throw new Error("two regions");
        }
        await insertRegions(h, second, first);
        expect(regionIdsOf((await regionsOf(h)).items)).toEqual([
          first.id,
          second.id,
        ]);
      });

      it("explorationQueries#64 地域 R1・R2 の位置が、origin から 5 km・1 km。firstPublishedAt は R1 が新しい / その origin で呼ぶ", async () => {
        const { h, w } = await setup();
        const origin = at(35.7, 139.8);
        const R2 = await w.region({ location: northOf(origin, 1000) });
        const R1 = await w.region({ location: northOf(origin, 5000) });
        expect(regionIdsOf((await regionsOf(h, { origin })).items)).toEqual([
          R2.id,
          R1.id,
        ]);
      });

      it("explorationQueries#65 地域 R1 の位置は origin から 5 km で、R1 に所属する閉店した店舗の位置は 500 m。地域 R2 の位置は 1 km。地域 R3 の位置は 3 km で、R3 に所属する非公開の店舗の位置は 100 m / その origin で呼ぶ", async () => {
        const { h, w } = await setup();
        const origin = at(35.7, 139.8);
        const R1 = await w.region({ location: northOf(origin, 5000) });
        const R2 = await w.region({ location: northOf(origin, -1000) });
        const R3 = await w.region({ location: northOf(origin, 3000) });
        const closed = await placeAt(w, northOf(origin, -500), {
          status: "permanentlyClosed",
        });
        const hidden = await placeAt(w, northOf(origin, 100), {
          suspended: true,
        });
        await w.affiliate(closed.id, [R1.id]);
        await w.affiliate(hidden.id, [R3.id]);
        expect(regionIdsOf((await regionsOf(h, { origin })).items)).toEqual([
          R1.id,
          R2.id,
          R3.id,
        ]);
      });

      it("explorationQueries#66 対象の地域が3つ / page: 1・limit: 3 で呼ぶ", async () => {
        const { h, w } = await setup();
        for (let i = 0; i < 3; i += 1) await w.region();
        const page = await regionsOf(h, { pagination: { page: 1, limit: 3 } });
        expect(page.items).toHaveLength(3);
        expect(page.count).toBe(3);
      });

      it("explorationQueries#67 対象の地域が5つ / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ", async () => {
        const { h, w } = await setup();
        const regions: Region[] = [];
        for (let i = 0; i < 5; i += 1) regions.push(await w.region());
        const pages = [
          await regionsOf(h, { pagination: { page: 1, limit: 3 } }),
          await regionsOf(h, { pagination: { page: 2, limit: 3 } }),
          await regionsOf(h, { pagination: { page: 3, limit: 3 } }),
        ];
        expect(pages.map((p) => p.items.length)).toEqual([3, 2, 0]);
        expect(pages.map((p) => p.count)).toEqual([5, 5, 5]);
        expect(pages.flatMap((p) => regionIdsOf(p.items))).toEqual(
          regionIdsOf(regions).reverse(),
        );
      });
    });

    describe("findPlacesOfRegion", () => {
      it("explorationQueries#68 公開中の地域 R に、所属する店舗がない / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        await w.place();
        expect(await placesOf(h, R.id)).toEqual({ items: [], count: 0 });
      });

      it("explorationQueries#69 R に、店舗 P（affiliatedAt が T1）、Q（T2）、S（T3）が所属している。registeredAt は P が最も新しい / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const P = newPlace(w.f.place(), {}, new Date("2026-09-03T00:00:00Z"));
        const Q = newPlace(w.f.place(), {}, new Date("2026-09-02T00:00:00Z"));
        const S = newPlace(w.f.place(), {}, new Date("2026-09-01T00:00:00Z"));
        await insertPlaces(h, P, Q, S);
        const ties = [];
        for (const place of [P, Q, S]) {
          ties.push({
            place,
            affiliations: await w.affiliate(place.id, [R.id]),
          });
        }
        const page = await placesOf(h, R.id);
        expect(page.count).toBe(3);
        expect(page.items).toEqual(
          [...ties]
            .reverse()
            .map(({ place, affiliations }) =>
              w.entryOf(place, [], { affiliations, regions: [R] }),
            ),
        );
      });

      it("explorationQueries#70 R に、同じ affiliatedAt で店舗が2つ所属している / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const first = await w.place();
        const second = await w.place();
        const at = w.f.tick();
        await insertAffiliations(
          h,
          ...[second, first].map(
            (place) =>
              PlaceAffiliations.affiliate(
                PlaceAffiliations.empty(place.id, at),
                R.id,
                at,
              ).entity,
          ),
        );
        expect(placeIdsOf((await placesOf(h, R.id)).items)).toEqual([
          first.id,
          second.id,
        ]);
      });

      it("explorationQueries#71 R に、休業中の店舗、閉店した店舗、非公開の店舗が所属している / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const resting = await w.place({ status: "temporarilyClosed" });
        const closed = await w.place({ status: "permanentlyClosed" });
        const hidden = await w.place({ suspended: true });
        for (const place of [resting, closed, hidden]) {
          await w.affiliate(place.id, [R.id]);
        }
        const page = await placesOf(h, R.id);
        expect(placeIdsOf(page.items)).toEqual([resting.id]);
        expect(page.count).toBe(1);
      });

      it("explorationQueries#72 店舗 P が R と S に所属し、代表地域は S / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const S = await w.region();
        const P = await w.place();
        const affiliations = await w.affiliate(P.id, [R.id, S.id], S.id);
        const page = await placesOf(h, R.id);
        expect(page.items).toEqual([
          w.entryOf(P, [], { affiliations, regions: [R, S] }),
        ]);
        expect(page.items[0]?.regions).toEqual([S, R]);
      });

      it("explorationQueries#73 店舗 P が R との所属を解除（leave または exclude）して保存されている / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const kept = await w.place();
        const left = await w.place();
        const excluded = await w.place();
        for (const place of [kept, left, excluded]) {
          await w.affiliate(place.id, [R.id]);
        }
        await w.updateAffiliations(
          left.id,
          (stored) => PlaceAffiliations.leave(stored, R.id, w.f.tick()).entity,
        );
        await w.updateAffiliations(
          excluded.id,
          (stored) =>
            PlaceAffiliations.exclude(stored, R.id, w.f.tick()).entity,
        );
        const page = await placesOf(h, R.id);
        expect(placeIdsOf(page.items)).toEqual([kept.id]);
        expect(page.count).toBe(1);
      });

      it("explorationQueries#74 地域 R が unpublished、または運営による非公開。または、その ID の地域がない / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const unpublished = await w.region({ state: "unpublished" });
        const suspended = await w.region({ state: "suspended" });
        const P = await w.place();
        await w.affiliate(P.id, [unpublished.id, suspended.id]);
        for (const id of [unpublished.id, suspended.id, UNKNOWN_REGION]) {
          expect(await placesOf(h, id)).toEqual({ items: [], count: 0 });
        }
      });

      it("explorationQueries#75 R に対象の店舗が5つ / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const places = await members(w, R, 5);
        const pages = [
          await placesOf(h, R.id, { page: 1, limit: 3 }),
          await placesOf(h, R.id, { page: 2, limit: 3 }),
          await placesOf(h, R.id, { page: 3, limit: 3 }),
        ];
        expect(pages.map((p) => p.items.length)).toEqual([3, 2, 0]);
        expect(pages.map((p) => p.count)).toEqual([5, 5, 5]);
        expect(pages.flatMap((p) => placeIdsOf(p.items))).toEqual(
          places.map((place) => place.id).reverse(),
        );
      });
    });

    describe("findListingsOfRegion", () => {
      it("explorationQueries#76 公開中の地域 R に所属する店舗 P・Q に、フィード対象の掲載 L1（P）・L2（Q）・L3（P）があり、firstPublishedAt は T1 < T2 < T3 / R で、excludingPlaceId: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const P = await w.place();
        const Q = await w.place();
        const ofP = await w.affiliate(P.id, [R.id]);
        const ofQ = await w.affiliate(Q.id, [R.id]);
        const L1 = await w.available(P.id);
        const L2 = await w.available(Q.id);
        const L3 = await w.available(P.id);
        const entryOfP = w.entryOf(P, [L1, L3], {
          affiliations: ofP,
          regions: [R],
        });
        const entryOfQ = w.entryOf(Q, [L2], {
          affiliations: ofQ,
          regions: [R],
        });
        expect(await listingsOf(h, R.id)).toEqual({
          items: [
            { listing: L3, place: entryOfP },
            { listing: L2, place: entryOfQ },
            { listing: L1, place: entryOfP },
          ],
          count: 3,
        });
      });

      it("explorationQueries#77 上と同じ / excludingPlaceId: P で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const P = await w.place();
        const Q = await w.place();
        await w.affiliate(P.id, [R.id]);
        await w.affiliate(Q.id, [R.id]);
        await w.available(P.id);
        const L2 = await w.available(Q.id);
        await w.available(P.id);
        const page = await listingsOf(h, R.id, { excludingPlaceId: P.id });
        expect(listingIdsOf(page.items)).toEqual([L2.id]);
        expect(page.count).toBe(1);
      });

      it("explorationQueries#78 firstPublishedAt が同じ掲載が2件 / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const [P] = await members(w, R, 1);
        if (P === undefined) throw new Error("a place");
        const at = w.f.tick();
        const first = w.f.published(P.id, {}, at);
        const second = w.f.published(P.id, {}, at);
        await w.store(second);
        await w.store(first);
        expect(first.id < second.id).toBe(true);
        expect(listingIdsOf((await listingsOf(h, R.id)).items)).toEqual([
          first.id,
          second.id,
        ]);
      });

      it("explorationQueries#79 R に所属する営業中の店舗に、提供開始前・提供終了・unpublished・運営による非公開の掲載がある。R に所属する閉店した店舗と非公開の店舗に、published で提供中の掲載がある / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const open = await w.place();
        const closed = await w.place({ status: "permanentlyClosed" });
        const hidden = await w.place({ suspended: true });
        for (const place of [open, closed, hidden]) {
          await w.affiliate(place.id, [R.id]);
        }
        await w.upcoming(open.id);
        await w.endedBySchedule(open.id);
        await w.endedByHand(open.id);
        await w.unpublished(open.id);
        await w.suspendedListing(open.id);
        await w.available(closed.id);
        await w.available(hidden.id);
        expect(await listingsOf(h, R.id)).toEqual({ items: [], count: 0 });
      });

      it("explorationQueries#80 R に所属する休業中の店舗に、published で提供中の掲載がある / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const resting = await w.place({ status: "temporarilyClosed" });
        await w.affiliate(resting.id, [R.id]);
        const L = await w.available(resting.id);
        expect(listingIdsOf((await listingsOf(h, R.id)).items)).toEqual([L.id]);
      });

      it("explorationQueries#81 店舗 P は R と S に所属し、代表地域は S。P にフィード対象の掲載がある / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const S = await w.region();
        const P = await w.place();
        await w.affiliate(P.id, [R.id, S.id], S.id);
        const L = await w.available(P.id);
        expect(listingIdsOf((await listingsOf(h, R.id)).items)).toEqual([L.id]);
      });

      it("explorationQueries#82 R に所属しない店舗に、フィード対象の掲載がある / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const outside = await w.place();
        await w.available(outside.id);
        expect(await listingsOf(h, R.id)).toEqual({ items: [], count: 0 });
      });

      it("explorationQueries#83 地域 R が unpublished、または運営による非公開。または、その ID の地域がない / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const unpublished = await w.region({ state: "unpublished" });
        const suspended = await w.region({ state: "suspended" });
        const P = await w.place();
        await w.affiliate(P.id, [unpublished.id, suspended.id]);
        await w.available(P.id);
        for (const id of [unpublished.id, suspended.id, UNKNOWN_REGION]) {
          expect(await listingsOf(h, id)).toEqual({ items: [], count: 0 });
        }
      });

      it("explorationQueries#84 R に所属する店舗はあるが、対象の掲載がない / R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const [P] = await members(w, R, 2);
        if (P === undefined) throw new Error("a place");
        await w.draft(P.id);
        expect(await listingsOf(h, R.id)).toEqual({ items: [], count: 0 });
      });

      it("explorationQueries#85 R に対象の掲載が5件 / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const places = await members(w, R, 2);
        const listings: Listing[] = [];
        for (let i = 0; i < 5; i += 1) {
          const place = places[i % 2];
          if (place === undefined) throw new Error("a place");
          listings.push(await w.available(place.id));
        }
        const pages = [
          await listingsOf(h, R.id, { pagination: { page: 1, limit: 3 } }),
          await listingsOf(h, R.id, { pagination: { page: 2, limit: 3 } }),
          await listingsOf(h, R.id, { pagination: { page: 3, limit: 3 } }),
        ];
        expect(pages.map((p) => p.items.length)).toEqual([3, 2, 0]);
        expect(pages.map((p) => p.count)).toEqual([5, 5, 5]);
        expect(pages.flatMap((p) => listingIdsOf(p.items))).toEqual(
          newestFirst(listings),
        );
      });
    });

    describe("findOccasions", () => {
      it("explorationQueries#86 イベントが1つもない / findOccasions を呼ぶ", async () => {
        const { h } = await setup();
        expect(await occasionsOf(h)).toEqual({ items: [], count: 0 });
      });

      it("explorationQueries#87 参加を1つも持たない、開催前の公開中のイベント E / findOccasions を呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        expect(await occasionsOf(h)).toEqual({ items: [E], count: 1 });
      });

      it("explorationQueries#88 開催期間が 5/1〜5/10 の公開中のイベント E / today を 4/30、5/1、5/10、5/11 にして、それぞれ呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion({ period: ["2026-05-01", "2026-05-10"] });
        const idsOn = async (iso: string) =>
          occasionIdsOf((await occasionsOf(h, { today: day(iso) })).items);
        expect(await idsOn("2026-04-30")).toEqual([E.id]);
        expect(await idsOn("2026-05-01")).toEqual([E.id]);
        expect(await idsOn("2026-05-10")).toEqual([E.id]);
        expect(await idsOn("2026-05-11")).toEqual([]);
      });

      it("explorationQueries#89 開催前で cancellation.cancelled: true のイベント / findOccasions を呼ぶ", async () => {
        const { h, w } = await setup();
        await w.occasion({ state: "cancelled" });
        expect(await occasionsOf(h)).toEqual({ items: [], count: 0 });
      });

      it("explorationQueries#90 中止を取り消した（revokeCancellation）開催前のイベント / findOccasions を呼ぶ", async () => {
        const { h, w } = await setup();
        const cancelled = await w.occasion({ state: "cancelled" });
        const E = await w.updateOccasion(
          cancelled,
          (stored) => Occasion.revokeCancellation(stored, w.f.tick()).entity,
        );
        expect(occasionIdsOf((await occasionsOf(h)).items)).toEqual([E.id]);
      });

      it("explorationQueries#91 開催前のイベントが、draft、unpublished、運営による非公開のいずれか / findOccasions を呼ぶ", async () => {
        const { h, w } = await setup();
        await w.occasion({ state: "draft" });
        await w.occasion({ state: "unpublished" });
        await w.occasion({ state: "suspended" });
        expect(await occasionsOf(h)).toEqual({ items: [], count: 0 });
      });

      it("explorationQueries#92 対象のイベント E1（5/1〜5/5）、E2（4/28〜5/2）、E3（5/1〜5/3）。firstPublishedAt は E1 が最も新しい / findOccasions を呼ぶ", async () => {
        const { h, w } = await setup();
        const E2 = await w.occasion({ period: ["2026-04-28", "2026-05-02"] });
        const E3 = await w.occasion({ period: ["2026-05-01", "2026-05-03"] });
        const E1 = await w.occasion({ period: ["2026-05-01", "2026-05-05"] });
        expect(
          occasionIdsOf(
            (await occasionsOf(h, { today: day("2026-04-20") })).items,
          ),
        ).toEqual([E2.id, E3.id, E1.id]);
      });

      it("explorationQueries#93 開催期間が同じ対象のイベントが2つ / findOccasions を呼ぶ", async () => {
        const { h, w } = await setup();
        const first = w.o.published({ period: PERIODS.upcoming });
        const second = w.o.published({ period: PERIODS.upcoming });
        expect(first.id < second.id).toBe(true);
        await insertOccasions(h, second, first);
        expect(occasionIdsOf((await occasionsOf(h)).items)).toEqual([
          first.id,
          second.id,
        ]);
      });

      it("explorationQueries#94 対象のイベントが3つ / page: 1・limit: 3 で呼ぶ", async () => {
        const { h, w } = await setup();
        for (let i = 0; i < 3; i += 1) await w.occasion();
        const page = await occasionsOf(h, {
          pagination: { page: 1, limit: 3 },
        });
        expect(page.items).toHaveLength(3);
        expect(page.count).toBe(3);
      });

      it("explorationQueries#95 対象のイベントが5つ / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ", async () => {
        const { h, w } = await setup();
        const occasions: Occasion[] = [];
        for (let i = 0; i < 5; i += 1) occasions.push(await w.occasion());
        const pages = [
          await occasionsOf(h, { pagination: { page: 1, limit: 3 } }),
          await occasionsOf(h, { pagination: { page: 2, limit: 3 } }),
          await occasionsOf(h, { pagination: { page: 3, limit: 3 } }),
        ];
        expect(pages.map((p) => p.items.length)).toEqual([3, 2, 0]);
        expect(pages.map((p) => p.count)).toEqual([5, 5, 5]);
        expect(pages.flatMap((p) => occasionIdsOf(p.items))).toEqual(
          occasionIdsOf(occasions),
        );
      });
    });

    describe("findArticles", () => {
      it.todo(
        "explorationQueries#96 読みものが1つもない / findArticles を呼ぶ",
      ); // S5
      it.todo(
        "explorationQueries#97 published の読みもの A1、draft の読みもの、unpublished の読みもの / findArticles を呼ぶ",
      ); // S5
      it.todo(
        "explorationQueries#98 紹介先を持たない公開中の読みものと、紹介先がすべて閲覧できない公開中の読みもの / findArticles を呼ぶ",
      ); // S5
      it.todo(
        "explorationQueries#99 公開中の読みもの A1・A2・A3 の firstPublishedAt が T1 < T2 < T3。A1 は公開を取り下げた後、T3 より後に再び公開されている / findArticles を呼ぶ",
      ); // S5
      it.todo(
        "explorationQueries#100 firstPublishedAt が同じ読みものが2つ / findArticles を呼ぶ",
      ); // S5
      it.todo(
        "explorationQueries#101 公開中の読みものが3つ / page: 1・limit: 3 で呼ぶ",
      ); // S5
      it.todo(
        "explorationQueries#102 公開中の読みものが5つ / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ",
      ); // S5
    });

    describe("可視性と UnitOfWork", () => {
      it("explorationQueries#103 店舗が保存されていない / UnitOfWork の中で店舗 P を insert してコミットし、直後に findPlaceCells・findPlacesInBounds・findMapExtent を呼ぶ", async () => {
        const { h, w } = await setup();
        expect(await placesExtent(h)).toBeNull();
        const P = await placeAt(w, inCell(1, 1));
        expect(shownIds(await cellsOf(h))).toEqual([P.id]);
        expect(placeIdsOf((await inBounds(h)).items)).toEqual([P.id]);
        expect(await placesExtent(h)).toEqual(
          GeoBounds.create(P.profile.location, P.profile.location),
        );
      });

      it("explorationQueries#104 営業中の店舗 P / P の営業状況を閉店にして save してコミットし、直後に findPlaceCells・findPlacesInBounds を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await placeAt(w, inCell(1, 1));
        expect(shownIds(await cellsOf(h))).toEqual([P.id]);
        await w.updatePlace(
          P,
          (stored) =>
            Place.changeOperatingStatus(stored, "permanentlyClosed", PLACE_T0)
              .entity,
        );
        expect(await cellsOf(h)).toEqual([]);
        expect(await inBounds(h)).toEqual({ items: [], count: 0 });
      });

      it("explorationQueries#105 K1 の draft の掲載だけを持つ店舗 P / 掲載を publish して save してコミットし、直後に categoryIds: {K1} で findPlaceCells を呼ぶ", async () => {
        const { h, w } = await setup();
        const K1 = w.f.category();
        const P = await placeAt(w, inCell(2, 2));
        const draft = await w.store(w.f.draft(P.id, { categoryId: K1 }));
        const criteria = criteriaOf({ categoryIds: [K1] });
        expect(await cellsOf(h, { criteria })).toEqual([]);
        await w.updateListing(
          draft,
          (stored) => Listing.publish(stored, w.f.tick()).entity,
        );
        expect(shownIds(await cellsOf(h, { criteria }))).toEqual([P.id]);
      });

      it("explorationQueries#106 公開中の地域 R と、R に所属しない店舗 P / P の PlaceAffiliations に R との所属を加えて保存してコミットし、直後に findPlacesOfRegion・findListingsOfRegion・region の範囲の findMapExtent を呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region({ location: at(35.72, 139.77) });
        const P = await placeAt(w, at(35.7, 139.8));
        const L = await w.available(P.id);
        expect((await placesOf(h, R.id)).count).toBe(0);
        await w.affiliate(P.id, [R.id]);
        expect(placeIdsOf((await placesOf(h, R.id)).items)).toEqual([P.id]);
        expect(listingIdsOf((await listingsOf(h, R.id)).items)).toEqual([L.id]);
        expect(await regionExtent(h, R.id)).toEqual(
          rect(35.7, 139.77, 35.72, 139.8),
        );
      });

      it("explorationQueries#107 公開中の地域 R / R を運営による非公開にして save してコミットし、直後に findRegions・findPlacesOfRegion を呼ぶ。続けて、解除して save してコミットし、もう一度呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const [P] = await members(w, R, 1);
        if (P === undefined) throw new Error("a place");
        await w.updateRegion(R, (s) => Region.suspend(s, w.f.tick()).entity);
        expect(await regionsOf(h)).toEqual({ items: [], count: 0 });
        expect(await placesOf(h, R.id)).toEqual({ items: [], count: 0 });
        await w.updateRegion(R, (s) => Region.unsuspend(s, w.f.tick()).entity);
        expect(regionIdsOf((await regionsOf(h)).items)).toEqual([R.id]);
        expect(placeIdsOf((await placesOf(h, R.id)).items)).toEqual([P.id]);
      });

      it.todo(
        "explorationQueries#108 draft のイベント E と draft の読みもの A（どちらも公開条件を満たす） / それぞれ publish して save してコミットし、直後に findOccasions・findArticles を呼ぶ",
      ); // S5

      it("an occasion published and committed shows in findOccasions at once (#108 without the article)", async () => {
        const { h, w } = await setup();
        const E = await w.occasion({ state: "draft" });
        expect(await occasionsOf(h)).toEqual({ items: [], count: 0 });
        await w.updateOccasion(
          E,
          (stored) => Occasion.publish(stored, w.f.tick()).entity,
        );
        expect(occasionIdsOf((await occasionsOf(h)).items)).toEqual([E.id]);
      });

      it("explorationQueries#109 店舗が保存されていない / UnitOfWork の中で店舗 P を insert した後に、fn が例外を投げる", async () => {
        const { h, w } = await setup();
        const P = w.buildPlace();
        const R = await w.region();
        await expect(
          h.uow.run(async ({ placeRepository }) => {
            await placeRepository.insert(P);
            throw new Error("rolled back");
          }),
        ).rejects.toThrow("rolled back");
        expect(await cellsOf(h)).toEqual([]);
        expect(await inBounds(h)).toEqual({ items: [], count: 0 });
        expect(await placesExtent(h)).toBeNull();
        expect(await placesOf(h, R.id)).toEqual({ items: [], count: 0 });
      });

      it("explorationQueries#110 公開中の地域 R / UnitOfWork の中で、unpublish した R を save した後に、fn が例外を投げる", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        await expect(
          h.uow.run(async ({ regionRepository }) => {
            const read = await regionRepository.findById(R.id);
            if (read === null) throw new Error("no region");
            await regionRepository.save(
              Region.unpublish(read.entity, w.f.tick()).entity,
              read.expectedVersion,
            );
            throw new Error("rolled back");
          }),
        ).rejects.toThrow("rolled back");
        expect(regionIdsOf((await regionsOf(h)).items)).toEqual([R.id]);
      });
    });
  });
}
