import type { PlaceId } from "@repo/core/domain/common/ids";
import { RegionId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { Listing } from "@repo/core/domain/listing/listing";
import type { Place } from "@repo/core/domain/place/place";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import {
  type DiscoveryHarness,
  type DiscoveryHarnessFactory,
  discoveryWorld,
  listingIdsOf,
  TODAY,
} from "./discoveryFixtures";
import { insertPlaces, newPlace } from "./placeFixtures";
import { insertAffiliations } from "./regionFixtures";

const PAGE = { page: 1, limit: 10 } as const;
const UNKNOWN_REGION = RegionId.create("ffffffff-ffff-7fff-8fff-00000ffffffd");

type Page = Readonly<{ page: number; limit: number }>;

const placeIdsOf = (entries: readonly Readonly<{ place: Place }>[]) =>
  entries.map((entry) => entry.place.id);

/**
 * `ExplorationQueries` contract (`spec/testcases/ports/explorationQueries.md`).
 * Stage 3a implements the region lists (`findPlacesOfRegion`,
 * `findListingsOfRegion`); the map, map lists, region search and occasion
 * list rows stay `todo` until stage 4, the article list until stage 5.
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

    describe("findPlaceCells の対象", () => {
      it.todo("explorationQueries#1 店舗が1つもない / findPlaceCells を呼ぶ"); // S4
      it.todo(
        "explorationQueries#2 bounds の内側に店舗 P、外側に店舗 S / findPlaceCells を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#3 店舗 P の位置が、bounds の南西の角とちょうど同じ。店舗 Q の位置が、北東の角とちょうど同じ / findPlaceCells を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#4 休業中の店舗、閉店した店舗、非公開の店舗が bounds の内側にある / findPlaceCells を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#5 掲載を1件も持たない店舗と、写真のない店舗が bounds の内側にある / findPlaceCells を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#6 所在地の areaCode が A の店舗 Pa と、B の店舗 Pb / areaCodes: {A} で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#7 店舗 P1 は K1 の提供中の掲載を持つ。店舗 P2 の K1 の掲載は、提供開始前と提供終了だけ。店舗 P3 の K1 の掲載は unpublished。店舗 P4 は K2 の提供中の掲載だけを持つ。店舗 P5 は掲載を持たない / categoryIds: {K1} で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#8 店舗 P に、content.categoryId が廃止された K のままの提供中の掲載がある。K の移行先は M / categoryIds: {M, K} で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#9 areaCode A で K1 の提供中の掲載を持つ店舗 P1、A で K1 の掲載を持たない店舗 P2、B で K1 の提供中の掲載を持つ店舗 P3 / areaCodes: {A}・categoryIds: {K1} で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#10 K1 の提供期間の開始が 5/10 の掲載だけを持つ店舗 P / categoryIds: {K1} で、today を 5/9 にして呼ぶ。別に 5/10 にして呼ぶ",
      ); // S4
    });

    describe("findPlaceCells の区画", () => {
      it.todo(
        "explorationQueries#11 店舗 P が1件だけ、ある区画にある / findPlaceCells を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#12 位置の違う店舗 P・Q が、同じ区画にある / findPlaceCells を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#13 上の結果の extent を次の bounds にする / 同じ grid で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#14 同じ位置の店舗 P・Q・T（registeredAt は T1 < T2 < T3）が、同じ区画にある / findPlaceCells を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#15 上と同じ / その位置だけの矩形（南西と北東がどちらもその位置）を bounds にして呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#16 同じ位置の店舗 P・Q と、位置の違う店舗 S が、同じ区画にある / findPlaceCells を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#17 店舗が、区画（column: 2・row: 0）、（column: 0・row: 1）、（column: 3・row: 1）に1件ずつある / findPlaceCells を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#18 bounds の内側に、位置の違う店舗が30件ある / grid を 1 × 1 にして呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#19 同じ経度に店舗 P・Q があり、bounds は幅が 0（西端と東端がその経度） / findPlaceCells を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#20 写真のない店舗 P に、提供中の掲載がある。P だけの区画 / findPlaceCells を呼ぶ",
      ); // S4
    });

    describe("findPlaceCells の選んでいる地域", () => {
      it.todo(
        "explorationQueries#21 公開中の地域 R に所属する店舗 P は、criteria に合わない。店舗 Q は criteria に合い、R に所属しない。P と Q は別々の区画 / selectedRegionId: R と、その criteria で呼ぶ",
      ); // S4
      it.todo("explorationQueries#22 上と同じ / selectedRegionId: null で呼ぶ"); // S4
      it.todo(
        "explorationQueries#23 R に所属し、criteria にも合う店舗 P / selectedRegionId: R で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#24 R に所属する店舗 P・Q と、所属しない店舗 S が、位置の違う店舗として同じ区画にある。どれも criteria に合う / selectedRegionId: R で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#25 R に所属する店舗 P・Q と、所属しない店舗 S が、同じ位置にある。どれも criteria に合う / selectedRegionId: R で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#26 R に所属する店舗 P・Q が、位置の違う店舗として同じ区画にある / selectedRegionId: null で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#27 R に、閉店した店舗と非公開の店舗が所属している / selectedRegionId: R で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#28 R に所属する店舗 P の位置が、bounds の外側 / selectedRegionId: R で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#29 地域 R が unpublished、または運営による非公開。R に所属する店舗 P は criteria に合わず、R に所属する店舗 Q は criteria に合う / selectedRegionId: R で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#30 その ID の地域がない / その ID を selectedRegionId にして呼ぶ",
      ); // S4
    });

    describe("findMapExtent", () => {
      it.todo(
        "explorationQueries#31 店舗が1つもない / places の範囲で、areaCodes: null で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#32 店舗 P が1件だけ / places の範囲で、areaCodes: null で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#33 離れた位置に店舗 P・Q・S。さらに離れた位置に、閉店した店舗と非公開の店舗 / places の範囲で、areaCodes: null で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#34 areaCode A の店舗 P・Q と、B の店舗 S / places の範囲で、areaCodes: {A} で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#35 areaCode A の店舗 P は掲載を持ち、同じ A の店舗 T は掲載を持たない / places の範囲で、areaCodes: {A} で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#36 areaCode A の店舗がない。または areaCodes が空の集合 / places の範囲で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#37 公開中の地域 R に、店舗 P・Q が所属している / region の範囲で R を指定して呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#38 公開中の地域 R に、所属する店舗がない / region の範囲で R を指定して呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#39 公開中の地域 R に所属する店舗が、閉店した店舗と非公開の店舗だけ / region の範囲で R を指定して呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#40 地域 R が unpublished、または運営による非公開。または、その ID の地域がない / region の範囲で呼ぶ",
      ); // S4
    });

    describe("findPlacesInBounds", () => {
      it.todo(
        "explorationQueries#41 bounds の内側に、営業中の店舗、休業中の店舗、閉店した店舗、非公開の店舗。外側に営業中の店舗 / findPlacesInBounds を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#42 店舗が混ざった前提で、areaCodes と categoryIds を持つ criteria / 同じ bounds・criteria・today で、findPlacesInBounds（limit: 100）と、selectedRegionId: null の findPlaceCells を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#43 店舗 P1・P2・P3 の registeredAt が T1 < T2 < T3 / origin: null で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#44 registeredAt が同じ店舗が2つ / origin: null で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#45 店舗 P1・P2・P3 の位置が、origin から 100 m・500 m・2 km。registeredAt は P3 が最も新しい / その origin で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#46 Geo.distanceMeters が同じになる2つの店舗。registeredAt が違う / origin つきで呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#47 対象の店舗がない / findPlacesInBounds を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#48 対象の店舗が1つ / findPlacesInBounds を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#49 対象の店舗が3つ / page: 1・limit: 3 で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#50 対象の店舗が5つ / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ",
      ); // S4
    });

    describe("findRegions", () => {
      it.todo("explorationQueries#51 地域が1つもない / findRegions を呼ぶ"); // S4
      it.todo(
        "explorationQueries#52 published の地域 R1、draft の地域、unpublished の地域、published で運営による非公開の地域 / 条件をすべて null にして呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#53 所属する店舗を持たない公開中の地域と、所属する店舗に掲載がない公開中の地域 / 条件をすべて null にして呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#54 位置が bounds の内側の地域 R1、外側の地域 R2、bounds の北東の角とちょうど同じ位置の地域 R3 / その bounds で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#55 所在地の areaCode が A の地域 R1。所在地は B で、所属する営業中の店舗の所在地が A の地域 R2。所在地も所属する店舗の所在地も B の地域 R3 / areaCodes: {A} で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#56 所在地が B の地域 R に所属する、所在地が A の店舗が、非公開の店舗だけ / areaCodes: {A} で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#57 上の前提で、所在地が A の閉店した店舗が R に所属している。別に、所在地が A の休業中の店舗だけが所属する、所在地が B の地域 R' がある / areaCodes: {A} で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#58 公開中の地域がある / areaCodes を空の集合にして呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#59 位置が vicinity.center から 900 m の地域 R1、ちょうど 1,000 m の地域 R2、1,100 m の地域 R3 / vicinity の radiusMeters を 1000 にして呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#60 位置が vicinity.center から 5 km の地域 R4 に、800 m の閉店した店舗が所属している。5 km の地域 R5 に、800 m の非公開の店舗だけが所属している / radiusMeters を 1000 にして呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#61 bounds の内側で areaCode A の地域 R1、bounds の内側で B の地域 R2、bounds の外側で A の地域 R3 / その bounds と areaCodes: {A} で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#62 地域 R1・R2・R3 の firstPublishedAt が T1 < T2 < T3。R1 は公開を取り下げた後、T3 より後に再び公開されている / origin: null で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#63 firstPublishedAt が同じ地域が2つ / origin: null で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#64 地域 R1・R2 の位置が、origin から 5 km・1 km。firstPublishedAt は R1 が新しい / その origin で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#65 地域 R1 の位置は origin から 5 km で、R1 に所属する閉店した店舗の位置は 500 m。地域 R2 の位置は 1 km。地域 R3 の位置は 3 km で、R3 に所属する非公開の店舗の位置は 100 m / その origin で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#66 対象の地域が3つ / page: 1・limit: 3 で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#67 対象の地域が5つ / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ",
      ); // S4
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
      it.todo(
        "explorationQueries#86 イベントが1つもない / findOccasions を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#87 参加を1つも持たない、開催前の公開中のイベント E / findOccasions を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#88 開催期間が 5/1〜5/10 の公開中のイベント E / today を 4/30、5/1、5/10、5/11 にして、それぞれ呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#89 開催前で cancellation.cancelled: true のイベント / findOccasions を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#90 中止を取り消した（revokeCancellation）開催前のイベント / findOccasions を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#91 開催前のイベントが、draft、unpublished、運営による非公開のいずれか / findOccasions を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#92 対象のイベント E1（5/1〜5/5）、E2（4/28〜5/2）、E3（5/1〜5/3）。firstPublishedAt は E1 が最も新しい / findOccasions を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#93 開催期間が同じ対象のイベントが2つ / findOccasions を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#94 対象のイベントが3つ / page: 1・limit: 3 で呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#95 対象のイベントが5つ / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ",
      ); // S4
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
      it.todo(
        "explorationQueries#103 店舗が保存されていない / UnitOfWork の中で店舗 P を insert してコミットし、直後に findPlaceCells・findPlacesInBounds・findMapExtent を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#104 営業中の店舗 P / P の営業状況を閉店にして save してコミットし、直後に findPlaceCells・findPlacesInBounds を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#105 K1 の draft の掲載だけを持つ店舗 P / 掲載を publish して save してコミットし、直後に categoryIds: {K1} で findPlaceCells を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#106 公開中の地域 R と、R に所属しない店舗 P / P の PlaceAffiliations に R との所属を加えて保存してコミットし、直後に findPlacesOfRegion・findListingsOfRegion・region の範囲の findMapExtent を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#107 公開中の地域 R / R を運営による非公開にして save してコミットし、直後に findRegions・findPlacesOfRegion を呼ぶ。続けて、解除して save してコミットし、もう一度呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#108 draft のイベント E と draft の読みもの A（どちらも公開条件を満たす） / それぞれ publish して save してコミットし、直後に findOccasions・findArticles を呼ぶ",
      ); // S4
      it.todo(
        "explorationQueries#109 店舗が保存されていない / UnitOfWork の中で店舗 P を insert した後に、fn が例外を投げる",
      ); // S4
      it.todo(
        "explorationQueries#110 公開中の地域 R / UnitOfWork の中で、unpublish した R を save した後に、fn が例外を投げる",
      ); // S4

      it("an affiliation committed to a region shows in findPlacesOfRegion and findListingsOfRegion at once (#106 without findMapExtent)", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const P = await w.place();
        const L = await w.available(P.id);
        expect((await placesOf(h, R.id)).count).toBe(0);
        await w.affiliate(P.id, [R.id]);
        expect(placeIdsOf((await placesOf(h, R.id)).items)).toEqual([P.id]);
        expect(listingIdsOf((await listingsOf(h, R.id)).items)).toEqual([L.id]);
      });

      it("a region suspended and unsuspended empties and restores findPlacesOfRegion at once (#107 without findRegions)", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const [P] = await members(w, R, 1);
        if (P === undefined) throw new Error("a place");
        await w.updateRegion(R, (s) => Region.suspend(s, w.f.tick()).entity);
        expect(await placesOf(h, R.id)).toEqual({ items: [], count: 0 });
        await w.updateRegion(R, (s) => Region.unsuspend(s, w.f.tick()).entity);
        expect(placeIdsOf((await placesOf(h, R.id)).items)).toEqual([P.id]);
      });
    });
  });
}
