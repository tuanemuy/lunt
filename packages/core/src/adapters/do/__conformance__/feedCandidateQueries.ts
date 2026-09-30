import type { AreaCode } from "@repo/core/domain/common/areaCode";
import { GeoPoint } from "@repo/core/domain/common/geo";
import type { CategoryId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import {
  BrowseCriteria,
  type ResolvedCriteria,
} from "@repo/core/domain/discovery/browseCriteria";
import { Listing } from "@repo/core/domain/listing/listing";
import { Place } from "@repo/core/domain/place/place";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import {
  type DiscoveryHarness,
  type DiscoveryHarnessFactory,
  type DiscoveryWorld,
  discoveryWorld,
  listingIdsOf,
  PERIODS,
  TODAY,
} from "./discoveryFixtures";
import { day, openDates, period } from "./listingFixtures";
import { PLACE_T0 } from "./placeFixtures";
import { insertRegions, regionContent } from "./regionFixtures";

type Page = Readonly<{ page: number; limit: number }>;

const PAGE: Page = { page: 1, limit: 10 };

const AREA_A: AreaCode = SampleAddress.otemachi().areaCode;
const AREA_B: AreaCode = SampleAddress.ginza().areaCode;

/** Criteria as given: `undefined` is no condition of that kind. */
const criteriaOf = (
  given: Readonly<{
    areaCodes?: readonly AreaCode[];
    categoryIds?: readonly CategoryId[];
  }>,
): ResolvedCriteria => ({
  areaCodes: given.areaCodes === undefined ? null : new Set(given.areaCodes),
  categoryIds:
    given.categoryIds === undefined ? null : new Set(given.categoryIds),
  effective: { areas: [], categoryIds: [] },
});

type QueryOptions = Readonly<{
  criteria?: ResolvedCriteria;
  origin?: GeoPoint | null;
  today?: LocalDate;
  pagination?: Page;
}>;

const queryOf = (options: QueryOptions) => ({
  criteria: options.criteria ?? BrowseCriteria.none(),
  origin: options.origin ?? null,
  today: options.today ?? TODAY,
});

/** The origin of the distance rows. */
const ORIGIN = GeoPoint.create(35, 139);

/** Metres per degree of latitude on the `Geo` sphere. */
const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;

/** The point `metres` due north of `ORIGIN`. */
const north = (metres: number) =>
  GeoPoint.create(
    ORIGIN.latitude + metres / METRES_PER_DEGREE,
    ORIGIN.longitude,
  );

const at = (point: GeoPoint) => ({
  latitude: point.latitude,
  longitude: point.longitude,
});

const idsOf = (
  page: Readonly<{ items: readonly Readonly<{ id: string }>[] }>,
) => page.items.map((item) => item.id);

/**
 * `FeedCandidateQueries` contract
 * (`spec/testcases/ports/feedCandidateQueries.md`). Every row runs in stage
 * 4; article frames are not this port's (`ExplorationQueries.findArticles`).
 */
export function describeFeedCandidateQueriesContract(
  makeHarness: DiscoveryHarnessFactory,
): void {
  describe("FeedCandidateQueries contract", () => {
    const setup = async () => {
      const h = await makeHarness();
      return { h, w: discoveryWorld(h) };
    };

    const listings = (h: DiscoveryHarness, options: QueryOptions = {}) =>
      h.feedCandidateQueries.findListings(
        queryOf(options),
        options.pagination ?? PAGE,
      );

    const regionFrames = (h: DiscoveryHarness, options: QueryOptions = {}) =>
      h.feedCandidateQueries.findRegionFrames(
        queryOf(options),
        options.pagination ?? PAGE,
      );

    const occasionFrames = (h: DiscoveryHarness, options: QueryOptions = {}) =>
      h.feedCandidateQueries.findOccasionFrames(
        queryOf(options),
        options.pagination ?? PAGE,
      );

    const listingIds = async (h: DiscoveryHarness, options?: QueryOptions) =>
      listingIdsOf((await listings(h, options)).items);

    /** A place at `point` with one feed listing. */
    const placeWithListing = async (w: DiscoveryWorld, point?: GeoPoint) => {
      const P = await w.place(
        point === undefined ? {} : { profile: { location: at(point) } },
      );
      const L = await w.available(P.id);
      return { P, L };
    };

    /** A published region whose one affiliated place has a feed listing. */
    const regionWithListing = async (w: DiscoveryWorld, point?: GeoPoint) => {
      const R = await w.region(point === undefined ? {} : { location: point });
      const { P, L } = await placeWithListing(w, point);
      await w.affiliate(P.id, [R.id]);
      return { R, P, L };
    };

    /** A published upcoming occasion with one open place taking part. */
    const occasionWithParticipant = async (
      w: DiscoveryWorld,
      spec: Parameters<DiscoveryWorld["occasion"]>[0] = {},
    ) => {
      const E = await w.occasion(spec);
      const P = await w.place();
      await w.participate(E.id, P.id);
      return E;
    };

    /** Pages 1–3 of 3 each: their sizes, counts and ids in order. */
    const threePages = async (
      read: (
        pagination: Page,
      ) => Promise<Readonly<{ items: readonly unknown[]; count: number }>>,
      id: (item: never) => string,
    ) => {
      const pages = [
        await read({ page: 1, limit: 3 }),
        await read({ page: 2, limit: 3 }),
        await read({ page: 3, limit: 3 }),
      ];
      return {
        sizes: pages.map((p) => p.items.length),
        counts: pages.map((p) => p.count),
        ids: pages.flatMap((p) => p.items.map((item) => id(item as never))),
      };
    };

    describe("findListings の対象", () => {
      it("feedCandidateQueries#1 掲載が1件もない / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        await w.place();
        expect(await listings(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#2 営業中の店舗 P のフィード対象の掲載 L が1件 / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const { P, L } = await placeWithListing(w);
        expect(await listings(h)).toEqual({
          items: [{ listing: L, place: w.entryOf(P, [L]) }],
          count: 1,
        });
      });

      it("feedCandidateQueries#3 店舗 P に、draft の掲載、unpublished（byManager）の掲載、unpublished（photoTakedown）の掲載、published で運営による非公開の掲載がある / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        await w.draft(P.id);
        await w.unpublished(P.id);
        await w.takenDown(P.id);
        await w.suspendedListing(P.id);
        expect(await listings(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#4 非公開の店舗 P に、published で提供中の掲載がある / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place({ suspended: true });
        await w.available(P.id);
        expect(await listings(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#5 フィード対象の掲載 L を ListingRepository.delete で削除した / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const { L } = await placeWithListing(w);
        await w.deleteListing(L);
        expect(await listings(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#6 営業中の店舗に、提供期間の開始が今日より後の掲載、提供期間の終了が今日より前の掲載、最後の開催日が今日より前の掲載、manualEnd.ended: true の掲載がある / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        await w.upcoming(P.id);
        await w.endedBySchedule(P.id);
        await w.store(
          w.f.published(P.id, { offering: openDates("2026-07-01") }),
        );
        await w.endedByHand(P.id);
        expect(await listings(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#7 営業中の店舗に、最初の開催日が今日より後の掲載と、提供の設定が「設定しない」の掲載がある / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const dated = await w.store(
          w.f.published(P.id, {
            offering: openDates("2026-07-20", "2026-07-21"),
          }),
        );
        const unset = await w.available(P.id);
        expect(await listingIds(h)).toEqual([unset.id, dated.id]);
      });

      it("feedCandidateQueries#8 提供期間の開始が 5/10 の published の掲載 / today を 5/9 にして呼ぶ。別に 5/10 にして呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.store(
          w.f.published(P.id, { offering: period("2026-05-10", null) }),
        );
        expect(await listingIds(h, { today: day("2026-05-09") })).toEqual([]);
        expect(await listingIds(h, { today: day("2026-05-10") })).toEqual([
          L.id,
        ]);
      });

      it("feedCandidateQueries#9 提供期間の終了が 5/8 の掲載と、最後の開催日が 5/8 の掲載 / today を 5/8 にして呼ぶ。別に 5/9 にして呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const byPeriod = await w.store(
          w.f.published(P.id, { offering: period(null, "2026-05-08") }),
        );
        const byDates = await w.store(
          w.f.published(P.id, {
            offering: openDates("2026-05-01", "2026-05-08"),
          }),
        );
        expect(await listingIds(h, { today: day("2026-05-08") })).toEqual([
          byDates.id,
          byPeriod.id,
        ]);
        expect(await listingIds(h, { today: day("2026-05-09") })).toEqual([]);
      });

      it("feedCandidateQueries#10 休業中（temporarilyClosed）の店舗と、閉店（permanentlyClosed）の店舗に、published で提供中の掲載がある / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const resting = await w.place({ status: "temporarilyClosed" });
        const closed = await w.place({ status: "permanentlyClosed" });
        const L = await w.available(resting.id);
        await w.available(closed.id);
        expect(await listings(h)).toEqual({
          items: [{ listing: L, place: w.entryOf(resting, [L]) }],
          count: 1,
        });
      });

      it("feedCandidateQueries#11 フィード対象の掲載 L が、参加（Participation）の listingIds に添えられている / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const { P, L } = await placeWithListing(w);
        const E = await w.occasion();
        await w.participate(E.id, P.id, { listingIds: [L.id] });
        expect(await listings(h)).toEqual({
          items: [{ listing: L, place: w.entryOf(P, [L]) }],
          count: 1,
        });
      });
    });

    describe("findListings の絞り込み", () => {
      const twoAreas = async (w: DiscoveryWorld) => {
        const Pa = await w.place({
          profile: { address: SampleAddress.otemachi() },
        });
        const Pb = await w.place({
          profile: { address: SampleAddress.ginza() },
        });
        return {
          La: await w.available(Pa.id),
          Lb: await w.available(Pb.id),
        };
      };

      it("feedCandidateQueries#12 所在地の areaCode が A の店舗の掲載 La と、B の店舗の掲載 Lb（どちらもフィード対象） / areaCodes: {A} で呼ぶ", async () => {
        const { h, w } = await setup();
        const { La } = await twoAreas(w);
        const page = await listings(h, {
          criteria: criteriaOf({ areaCodes: [AREA_A] }),
        });
        expect(listingIdsOf(page.items)).toEqual([La.id]);
        expect(page.count).toBe(1);
      });

      it("feedCandidateQueries#13 上と同じ / areaCodes: {A, B} で呼ぶ", async () => {
        const { h, w } = await setup();
        const { La, Lb } = await twoAreas(w);
        expect(
          await listingIds(h, {
            criteria: criteriaOf({ areaCodes: [AREA_A, AREA_B] }),
          }),
        ).toEqual([Lb.id, La.id]);
      });

      it("feedCandidateQueries#14 上と同じ / areaCodes を空の集合にして呼ぶ", async () => {
        const { h, w } = await setup();
        await twoAreas(w);
        expect(
          await listings(h, { criteria: criteriaOf({ areaCodes: [] }) }),
        ).toEqual({ items: [], count: 0 });
      });

      const twoCategories = async (w: DiscoveryWorld) => {
        const K1 = w.f.category();
        const K2 = w.f.category();
        const P = await w.place();
        const L1 = await w.store(w.f.published(P.id, { categoryId: K1 }));
        const L2 = await w.store(w.f.published(P.id, { categoryId: K2 }));
        return { K1, K2, L1, L2 };
      };

      it("feedCandidateQueries#15 categoryId が K1 の掲載 L1 と、K2 の掲載 L2（どちらもフィード対象） / categoryIds: {K1} で呼ぶ", async () => {
        const { h, w } = await setup();
        const { K1, L1 } = await twoCategories(w);
        expect(
          await listingIds(h, { criteria: criteriaOf({ categoryIds: [K1] }) }),
        ).toEqual([L1.id]);
      });

      it("feedCandidateQueries#16 上と同じ / categoryIds: {K1, K2} で呼ぶ", async () => {
        const { h, w } = await setup();
        const { K1, K2, L1, L2 } = await twoCategories(w);
        expect(
          await listingIds(h, {
            criteria: criteriaOf({ categoryIds: [K1, K2] }),
          }),
        ).toEqual([L2.id, L1.id]);
      });

      /** L stored with K, which the catalog has since retired into M. */
      const retired = async (w: DiscoveryWorld) => {
        const K = w.f.category();
        const M = w.f.category();
        const P = await w.place();
        const L = await w.store(w.f.published(P.id, { categoryId: K }));
        return { K, M, L };
      };

      it("feedCandidateQueries#17 カテゴリー K が廃止され、移行先は M。content.categoryId に K が保存されたままのフィード対象の掲載 L / categoryIds: {M, K}（M の predecessorsOf）で呼ぶ", async () => {
        const { h, w } = await setup();
        const { K, M, L } = await retired(w);
        const page = await listings(h, {
          criteria: criteriaOf({ categoryIds: [M, K] }),
        });
        expect(listingIdsOf(page.items)).toEqual([L.id]);
        expect(page.items[0]?.listing.content.categoryId).toBe(K);
      });

      it("feedCandidateQueries#18 上と同じ / categoryIds: {M} で呼ぶ", async () => {
        const { h, w } = await setup();
        const { M } = await retired(w);
        expect(
          await listingIds(h, { criteria: criteriaOf({ categoryIds: [M] }) }),
        ).toEqual([]);
      });

      it("feedCandidateQueries#19 areaCode A の店舗の K1 の掲載 L1、A の店舗の K2 の掲載 L2、B の店舗の K1 の掲載 L3 / areaCodes: {A}・categoryIds: {K1} で呼ぶ", async () => {
        const { h, w } = await setup();
        const K1 = w.f.category();
        const K2 = w.f.category();
        const Pa = await w.place({
          profile: { address: SampleAddress.otemachi() },
        });
        const Pb = await w.place({
          profile: { address: SampleAddress.ginza() },
        });
        const L1 = await w.store(w.f.published(Pa.id, { categoryId: K1 }));
        await w.store(w.f.published(Pa.id, { categoryId: K2 }));
        await w.store(w.f.published(Pb.id, { categoryId: K1 }));
        expect(
          await listingIds(h, {
            criteria: criteriaOf({ areaCodes: [AREA_A], categoryIds: [K1] }),
          }),
        ).toEqual([L1.id]);
      });
    });

    describe("Entry の中身", () => {
      it("feedCandidateQueries#20 店舗 P が、公開中の地域 X・Y にこの順に所属し、代表地域に Y を選んでいる / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const X = await w.region({ name: "谷中" });
        const Y = await w.region({ name: "根津" });
        const { P, L } = await placeWithListing(w);
        const ties = await w.affiliate(P.id, [X.id, Y.id], Y.id);
        const page = await listings(h);
        expect(page.items[0]?.place.regions.map((r) => r.id)).toEqual([
          Y.id,
          X.id,
        ]);
        expect(page.items).toEqual([
          {
            listing: L,
            place: w.entryOf(P, [L], { affiliations: ties, regions: [X, Y] }),
          },
        ]);
      });

      it("feedCandidateQueries#21 店舗 P が X・Y・Z にこの順に所属し、代表地域に X を選んでいる。X は unpublished、Z は運営による非公開 / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const X = await w.region({ state: "unpublished" });
        const Y = await w.region();
        const Z = await w.region({ state: "suspended" });
        const { P } = await placeWithListing(w);
        await w.affiliate(P.id, [X.id, Y.id, Z.id]);
        const page = await listings(h);
        expect(page.items[0]?.place.regions.map((r) => r.id)).toEqual([Y.id]);
      });

      it("feedCandidateQueries#22 店舗 P の PlaceAffiliations が保存されていない。店舗 Q の PlaceAffiliations は所属が空 / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        await placeWithListing(w);
        const { P: Q } = await placeWithListing(w);
        await w.affiliate(Q.id, []);
        const page = await listings(h);
        expect(page.items).toHaveLength(2);
        expect(page.items.map((entry) => entry.place.regions)).toEqual([
          [],
          [],
        ]);
      });

      it("feedCandidateQueries#23 写真を持つ店舗 P / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place({ photos: 1 });
        await w.available(P.id);
        const page = await listings(h);
        expect(page.items[0]?.place.substituteCover).toBeNull();
      });

      const coverOf = (listing: Listing) => ({
        listingId: listing.id,
        photo: listing.content.photos.items[0],
      });

      it("feedCandidateQueries#24 写真のない店舗 P に、提供中の掲載 a1・a2 がある。firstPublishedAt は a1 が T1、a2 が T2（T1 < T2） / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const a1 = await w.available(P.id);
        const a2 = await w.available(P.id);
        const page = await listings(h);
        expect(listingIdsOf(page.items)).toEqual([a2.id, a1.id]);
        for (const entry of page.items) {
          expect(entry.place.substituteCover).toEqual(coverOf(a2));
        }
      });

      it("feedCandidateQueries#25 上に加えて、P に、firstPublishedAt が T3（T2 < T3）の提供開始前の掲載 u1 がある / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const a1 = await w.available(P.id);
        const a2 = await w.available(P.id);
        const u1 = await w.upcoming(P.id);
        const page = await listings(h);
        expect(listingIdsOf(page.items)).toEqual([a2.id, a1.id]);
        for (const entry of page.items) {
          expect(entry.place.substituteCover).toEqual(coverOf(u1));
        }
      });

      it("feedCandidateQueries#26 写真のない店舗 P に、firstPublishedAt が同じ提供中の掲載が2件ある / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const when = w.f.tick();
        const first = w.f.published(P.id, {}, when);
        const second = w.f.published(P.id, {}, when);
        await w.store(second);
        await w.store(first);
        expect(first.id < second.id).toBe(true);
        const page = await listings(h);
        expect(page.items).toHaveLength(2);
        for (const entry of page.items) {
          expect(entry.place.substituteCover).toEqual(coverOf(first));
        }
      });

      it("feedCandidateQueries#27 写真のない店舗 P に、提供中の掲載 a1（T1）と、firstPublishedAt が T2（T1 < T2）の掲載が、unpublished のものと運営による非公開のものとで1件ずつある / findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const a1 = await w.available(P.id);
        await w.unpublished(P.id);
        await w.suspendedListing(P.id);
        const page = await listings(h);
        expect(page.items).toEqual([
          { listing: a1, place: w.entryOf(P, [a1]) },
        ]);
        expect(page.items[0]?.place.substituteCover).toEqual(coverOf(a1));
      });
    });

    describe("findListings の並び順とページング", () => {
      it("feedCandidateQueries#28 フィード対象の掲載 L1・L2・L3 の firstPublishedAt が T1 < T2 < T3 / origin: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const { L: L1 } = await placeWithListing(w);
        const { L: L2 } = await placeWithListing(w);
        const { L: L3 } = await placeWithListing(w);
        expect(await listingIds(h)).toEqual([L3.id, L2.id, L1.id]);
      });

      it("feedCandidateQueries#29 上の L1 を unpublish して保存し、T3 より後に publish して保存した / origin: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const { L: L1 } = await placeWithListing(w);
        const { L: L2 } = await placeWithListing(w);
        const { L: L3 } = await placeWithListing(w);
        await w.updateListing(
          L1,
          (s) => Listing.unpublish(s, w.f.tick()).entity,
        );
        await w.updateListing(L1, (s) => Listing.publish(s, w.f.tick()).entity);
        expect(await listingIds(h)).toEqual([L3.id, L2.id, L1.id]);
      });

      it("feedCandidateQueries#30 firstPublishedAt が同じ掲載が2件 / origin: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const when = w.f.tick();
        const first = w.f.published(P.id, {}, when);
        const second = w.f.published(P.id, {}, when);
        await w.store(second);
        await w.store(first);
        expect(await listingIds(h)).toEqual([first.id, second.id]);
      });

      it("feedCandidateQueries#31 店舗 P1・P2・P3 の位置が、origin から 100 m・500 m・2 km。それぞれにフィード対象の掲載が1件。firstPublishedAt は P3 の掲載が最も新しい / その origin で呼ぶ", async () => {
        const { h, w } = await setup();
        const { L: L1 } = await placeWithListing(w, north(100));
        const { L: L2 } = await placeWithListing(w, north(500));
        const { L: L3 } = await placeWithListing(w, north(2_000));
        expect(await listingIds(h, { origin: ORIGIN })).toEqual([
          L1.id,
          L2.id,
          L3.id,
        ]);
      });

      it("feedCandidateQueries#32 同じ店舗に、フィード対象の掲載 a1（先に公開）と a2（後に公開） / origin つきで呼ぶ", async () => {
        const { h, w } = await setup();
        const { P, L: a1 } = await placeWithListing(w, north(300));
        const a2 = await w.available(P.id);
        expect(await listingIds(h, { origin: ORIGIN })).toEqual([a2.id, a1.id]);
      });

      it("feedCandidateQueries#33 Geo.distanceMeters が同じになる2つの店舗に、firstPublishedAt が同じ掲載が1件ずつ / origin つきで呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place({ profile: { location: at(north(800)) } });
        const Q = await w.place({ profile: { location: at(north(800)) } });
        const when = w.f.tick();
        const first = w.f.published(P.id, {}, when);
        const second = w.f.published(Q.id, {}, when);
        await w.store(second);
        await w.store(first);
        expect(await listingIds(h, { origin: ORIGIN })).toEqual([
          first.id,
          second.id,
        ]);
      });

      const feedListings = async (w: DiscoveryWorld, n: number) => {
        const made = [];
        for (let i = 0; i < n; i += 1) {
          made.push((await placeWithListing(w)).L);
        }
        return made.map((listing) => listing.id).reverse();
      };

      it("feedCandidateQueries#34 フィード対象の掲載が3件 / page: 1・limit: 3 で呼ぶ", async () => {
        const { h, w } = await setup();
        await feedListings(w, 3);
        const page = await listings(h, { pagination: { page: 1, limit: 3 } });
        expect(page.items).toHaveLength(3);
        expect(page.count).toBe(3);
      });

      it("feedCandidateQueries#35 フィード対象の掲載が5件 / limit: 3 で、page: 1 と page: 2 を呼ぶ", async () => {
        const { h, w } = await setup();
        const newest = await feedListings(w, 5);
        const first = await listings(h, { pagination: { page: 1, limit: 3 } });
        const second = await listings(h, { pagination: { page: 2, limit: 3 } });
        expect(listingIdsOf(first.items)).toEqual(newest.slice(0, 3));
        expect(listingIdsOf(second.items)).toEqual(newest.slice(3));
        expect([first.count, second.count]).toEqual([5, 5]);
      });

      it("feedCandidateQueries#36 フィード対象の掲載が5件 / page: 3・limit: 3 で呼ぶ", async () => {
        const { h, w } = await setup();
        await feedListings(w, 5);
        expect(
          await listings(h, { pagination: { page: 3, limit: 3 } }),
        ).toEqual({ items: [], count: 5 });
      });

      it("feedCandidateQueries#37 フィード対象の掲載が5件、対象でない掲載（提供終了、一時非公開）が3件 / limit: 100 で呼ぶ", async () => {
        const { h, w } = await setup();
        await feedListings(w, 5);
        const P = await w.place();
        await w.endedBySchedule(P.id);
        await w.endedByHand(P.id);
        await w.unpublished(P.id);
        const page = await listings(h, { pagination: { page: 1, limit: 100 } });
        expect(page.items).toHaveLength(5);
        expect(page.count).toBe(5);
      });
    });

    describe("findRegionFrames", () => {
      it("feedCandidateQueries#38 公開中の地域が1つもない / findRegionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        await placeWithListing(w);
        await w.region({ state: "draft" });
        expect(await regionFrames(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#39 公開中の地域 R に所属する店舗に、フィード対象の掲載が1件ある / findRegionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        const { R } = await regionWithListing(w);
        expect(await regionFrames(h)).toEqual({ items: [R], count: 1 });
      });

      it("feedCandidateQueries#40 公開中の地域 R に、所属する店舗がない。公開中の地域 S に所属する店舗の掲載は、提供終了と一時非公開だけ / findRegionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        await w.region();
        const S = await w.region();
        const P = await w.place();
        await w.affiliate(P.id, [S.id]);
        await w.endedBySchedule(P.id);
        await w.unpublished(P.id);
        expect(await regionFrames(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#41 公開中の地域 R に所属する店舗が、閉店した店舗と非公開の店舗だけ。どちらにも published で提供中の掲載がある / findRegionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const closed = await w.place({ status: "permanentlyClosed" });
        const hidden = await w.place({ suspended: true });
        for (const place of [closed, hidden]) {
          await w.affiliate(place.id, [R.id]);
          await w.available(place.id);
        }
        expect(await regionFrames(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#42 店舗 P が地域 X・Y に所属し、代表地域は X。P にフィード対象の掲載がある / findRegionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        const X = await w.region();
        const Y = await w.region();
        const { P } = await placeWithListing(w);
        await w.affiliate(P.id, [X.id, Y.id]);
        expect(idsOf(await regionFrames(h))).toEqual([Y.id, X.id]);
      });

      it("feedCandidateQueries#43 draft・unpublished・運営による非公開の地域に所属する店舗に、フィード対象の掲載がある / findRegionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        const regions = [
          await w.region({ state: "draft" }),
          await w.region({ state: "unpublished" }),
          await w.region({ state: "suspended" }),
        ];
        const { P } = await placeWithListing(w);
        await w.affiliate(
          P.id,
          regions.map((r) => r.id),
        );
        expect(await regionFrames(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#44 地域 R1 に所属する店舗（areaCode A）に K1 の掲載、地域 R2 に所属する店舗（areaCode A）に K2 の掲載、地域 R3 に所属する店舗（areaCode B）に K1 の掲載がある。R3 の所在地の areaCode は A / areaCodes: {A}・categoryIds: {K1} で呼ぶ", async () => {
        const { h, w } = await setup();
        const K1 = w.f.category();
        const K2 = w.f.category();
        const member = async (
          address: ReturnType<typeof SampleAddress.otemachi>,
          categoryId: CategoryId,
          regionAddress = address,
        ) => {
          const R = await w.region({ content: { address: regionAddress } });
          const P = await w.place({ profile: { address } });
          await w.affiliate(P.id, [R.id]);
          await w.store(w.f.published(P.id, { categoryId }));
          return R;
        };
        const R1 = await member(SampleAddress.otemachi(), K1);
        await member(SampleAddress.otemachi(), K2);
        await member(SampleAddress.ginza(), K1, SampleAddress.otemachi());
        expect(
          idsOf(
            await regionFrames(h, {
              criteria: criteriaOf({ areaCodes: [AREA_A], categoryIds: [K1] }),
            }),
          ),
        ).toEqual([R1.id]);
      });

      it("feedCandidateQueries#45 対象になる地域 R1・R2・R3 の firstPublishedAt が T1 < T2 < T3 / origin: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const { R: R1 } = await regionWithListing(w);
        const { R: R2 } = await regionWithListing(w);
        const { R: R3 } = await regionWithListing(w);
        expect(idsOf(await regionFrames(h))).toEqual([R3.id, R2.id, R1.id]);
      });

      it("feedCandidateQueries#46 firstPublishedAt が同じ対象の地域が2つ / origin: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const when = w.f.tick();
        const publishedAt = () =>
          Region.publish(
            Region.register(
              {
                id: w.o.region(),
                content: regionContent({ photoIds: [w.o.photo()] }),
              },
              when,
            ).entity,
            when,
          ).entity;
        const first = publishedAt();
        const second = publishedAt();
        await insertRegions(h, second, first);
        const { P } = await placeWithListing(w);
        await w.affiliate(P.id, [first.id, second.id]);
        expect(first.id < second.id).toBe(true);
        expect(idsOf(await regionFrames(h))).toEqual([first.id, second.id]);
      });

      it("feedCandidateQueries#47 地域 R1・R2 の位置と、それぞれに所属しフィード対象の掲載を持つ店舗の位置が、origin から 5 km・1 km / その origin で呼ぶ", async () => {
        const { h, w } = await setup();
        const { R: R1 } = await regionWithListing(w, north(5_000));
        const { R: R2 } = await regionWithListing(w, north(1_000));
        expect(idsOf(await regionFrames(h, { origin: ORIGIN }))).toEqual([
          R2.id,
          R1.id,
        ]);
      });

      it("feedCandidateQueries#48 地域 R1 の位置は origin から 5 km で、R1 に所属しフィード対象の掲載を持つ店舗の位置は 500 m。地域 R2 の位置と、R2 に所属しフィード対象の掲載を持つ店舗の位置は 1 km。地域 R3 の位置と、R3 に所属しフィード対象の掲載を持つ店舗の位置は 3 km で、R3 に所属する非公開の店舗の位置は 100 m / その origin で呼ぶ", async () => {
        const { h, w } = await setup();
        const R1 = await w.region({ location: north(5_000) });
        const { P: P1 } = await placeWithListing(w, north(500));
        await w.affiliate(P1.id, [R1.id]);
        const { R: R2 } = await regionWithListing(w, north(1_000));
        const { R: R3 } = await regionWithListing(w, north(3_000));
        const hidden = await w.place({
          suspended: true,
          profile: { location: at(north(100)) },
        });
        await w.affiliate(hidden.id, [R3.id]);
        expect(idsOf(await regionFrames(h, { origin: ORIGIN }))).toEqual([
          R1.id,
          R2.id,
          R3.id,
        ]);
      });

      it("feedCandidateQueries#49 対象になる地域が5つ / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ", async () => {
        const { h, w } = await setup();
        const made = [];
        for (let i = 0; i < 5; i += 1)
          made.push((await regionWithListing(w)).R);
        const pages = await threePages(
          (pagination) => regionFrames(h, { pagination }),
          (region: Readonly<{ id: string }>) => region.id,
        );
        expect(pages.sizes).toEqual([3, 2, 0]);
        expect(pages.counts).toEqual([5, 5, 5]);
        expect(pages.ids).toEqual(made.map((r) => r.id).reverse());
      });
    });

    describe("findOccasionFrames", () => {
      it("feedCandidateQueries#50 公開中のイベントが1つもない / findOccasionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion({ state: "draft" });
        const P = await w.place();
        await w.participate(E.id, P.id);
        expect(await occasionFrames(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#51 開催前の公開中のイベント E に、営業中の店舗の参加が1つある。参加は掲載を添えていない / findOccasionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await occasionWithParticipant(w);
        expect(await occasionFrames(h)).toEqual({ items: [E], count: 1 });
      });

      it("feedCandidateQueries#52 開催前のイベント E の参加に添えた掲載が、提供開始前の掲載だけ / findOccasionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const P = await w.place();
        const U = await w.upcoming(P.id);
        await w.participate(E.id, P.id, { listingIds: [U.id] });
        expect(idsOf(await occasionFrames(h))).toEqual([E.id]);
      });

      it("feedCandidateQueries#53 開催期間が今日を含むイベント E に、参加がある / findOccasionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await occasionWithParticipant(w, { period: PERIODS.ongoing });
        expect(idsOf(await occasionFrames(h))).toEqual([E.id]);
      });

      it("feedCandidateQueries#54 開催前のイベントに、参加が1つもない / findOccasionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        await w.occasion();
        expect(await occasionFrames(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#55 開催前のイベントの参加が、非公開の店舗の参加だけ / findOccasionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const hidden = await w.place({ suspended: true });
        await w.participate(E.id, hidden.id);
        expect(await occasionFrames(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#56 開催前のイベントの参加が、閉店した店舗の参加だけ / findOccasionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const closed = await w.place({ status: "permanentlyClosed" });
        await w.participate(E.id, closed.id);
        expect(idsOf(await occasionFrames(h))).toEqual([E.id]);
      });

      it("feedCandidateQueries#57 参加を持つイベントで、開催期間の終了が今日より前のものと、cancellation.cancelled: true のものがある / findOccasionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        await occasionWithParticipant(w, { period: PERIODS.ended });
        await occasionWithParticipant(w, { state: "cancelled" });
        expect(await occasionFrames(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#58 開催期間の終了が 5/10 の、参加を持つイベント / today を 5/10 にして呼ぶ。別に 5/11 にして呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await occasionWithParticipant(w, {
          period: ["2026-05-08", "2026-05-10"],
        });
        expect(
          idsOf(await occasionFrames(h, { today: day("2026-05-10") })),
        ).toEqual([E.id]);
        expect(
          idsOf(await occasionFrames(h, { today: day("2026-05-11") })),
        ).toEqual([]);
      });

      it("feedCandidateQueries#59 参加を持つ開催前のイベントが、draft、unpublished、運営による非公開のいずれか / findOccasionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        await occasionWithParticipant(w, { state: "draft" });
        await occasionWithParticipant(w, { state: "unpublished" });
        await occasionWithParticipant(w, { state: "suspended" });
        expect(await occasionFrames(h)).toEqual({ items: [], count: 0 });
      });

      it("feedCandidateQueries#60 開催場所の areaCode が A のイベント Ea と、B のイベント Eb（どちらも対象）。Ea の参加店舗の所在地は B / areaCodes: {A} で呼ぶ", async () => {
        const { h, w } = await setup();
        const Ea = await w.occasion({ address: SampleAddress.otemachi() });
        const Eb = await w.occasion({ address: SampleAddress.ginza() });
        const inB = await w.place({
          profile: { address: SampleAddress.ginza() },
        });
        await w.participate(Ea.id, inB.id);
        await w.participate(Eb.id, inB.id);
        expect(
          idsOf(
            await occasionFrames(h, {
              criteria: criteriaOf({ areaCodes: [AREA_A] }),
            }),
          ),
        ).toEqual([Ea.id]);
      });

      it("feedCandidateQueries#61 対象のイベント E の参加店舗が、K1 の掲載を持たない / categoryIds: {K2} で呼ぶ", async () => {
        const { h, w } = await setup();
        const K2 = w.f.category();
        const E = await occasionWithParticipant(w);
        expect(
          idsOf(
            await occasionFrames(h, {
              criteria: criteriaOf({ categoryIds: [K2] }),
            }),
          ),
        ).toEqual([E.id]);
      });

      it("feedCandidateQueries#62 対象のイベント E1（5/1〜5/5）、E2（4/28〜5/2）、E3（5/1〜5/3） / origin: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const today = day("2026-04-20");
        const E1 = await occasionWithParticipant(w, {
          period: ["2026-05-01", "2026-05-05"],
        });
        const E2 = await occasionWithParticipant(w, {
          period: ["2026-04-28", "2026-05-02"],
        });
        const E3 = await occasionWithParticipant(w, {
          period: ["2026-05-01", "2026-05-03"],
        });
        expect(idsOf(await occasionFrames(h, { today }))).toEqual([
          E2.id,
          E3.id,
          E1.id,
        ]);
      });

      it("feedCandidateQueries#63 開催期間が同じ対象のイベントが2つ / origin: null で呼ぶ", async () => {
        const { h, w } = await setup();
        const first = await occasionWithParticipant(w);
        const second = await occasionWithParticipant(w);
        expect(first.id < second.id).toBe(true);
        expect(idsOf(await occasionFrames(h))).toEqual([first.id, second.id]);
      });

      it("feedCandidateQueries#64 対象のイベント E1・E2 の開催場所が、origin から 5 km・1 km。開催は E1 のほうが早い / その origin で呼ぶ", async () => {
        const { h, w } = await setup();
        const E1 = await occasionWithParticipant(w, {
          location: north(5_000),
          period: PERIODS.ongoing,
        });
        const E2 = await occasionWithParticipant(w, {
          location: north(1_000),
          period: PERIODS.upcoming,
        });
        expect(idsOf(await occasionFrames(h))).toEqual([E1.id, E2.id]);
        expect(idsOf(await occasionFrames(h, { origin: ORIGIN }))).toEqual([
          E2.id,
          E1.id,
        ]);
      });

      it("feedCandidateQueries#65 対象のイベントが5つ / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ", async () => {
        const { h, w } = await setup();
        const made = [];
        for (let i = 0; i < 5; i += 1) {
          made.push(await occasionWithParticipant(w));
        }
        const pages = await threePages(
          (pagination) => occasionFrames(h, { pagination }),
          (occasion: Readonly<{ id: string }>) => occasion.id,
        );
        expect(pages.sizes).toEqual([3, 2, 0]);
        expect(pages.counts).toEqual([5, 5, 5]);
        expect(pages.ids).toEqual(made.map((e) => e.id));
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("feedCandidateQueries#66 draft の掲載 L（公開条件を満たす） / UnitOfWork の中で、publish した L を save してコミットし、直後に findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.draft(P.id);
        expect(await listingIds(h)).toEqual([]);
        await w.updateListing(L, (s) => Listing.publish(s, w.f.tick()).entity);
        expect(await listingIds(h)).toEqual([L.id]);
      });

      it("feedCandidateQueries#67 フィード対象の掲載 L / unpublish した L を save してコミットし、直後に findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const { L } = await placeWithListing(w);
        await w.updateListing(
          L,
          (s) => Listing.unpublish(s, w.f.tick()).entity,
        );
        expect(await listingIds(h)).toEqual([]);
      });

      it("feedCandidateQueries#68 店舗 P にフィード対象の掲載が2件 / P を非公開にして save してコミットし、直後に findListings を呼ぶ。続けて、非公開を解除して save してコミットし、もう一度呼ぶ", async () => {
        const { h, w } = await setup();
        const { P, L: L1 } = await placeWithListing(w);
        const L2 = await w.available(P.id);
        const suspended = await w.suspendPlace(P);
        expect(await listingIds(h)).toEqual([]);
        await w.unsuspendPlace(suspended);
        expect(await listingIds(h)).toEqual([L2.id, L1.id]);
      });

      it("feedCandidateQueries#69 店舗 P にフィード対象の掲載がある / P の営業状況を閉店にして save してコミットし、直後に findListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const { P } = await placeWithListing(w);
        await w.updatePlace(
          P,
          (s) =>
            Place.changeOperatingStatus(s, "permanentlyClosed", PLACE_T0)
              .entity,
        );
        expect(await listingIds(h)).toEqual([]);
      });

      it("feedCandidateQueries#70 フィード対象の掲載を持つ店舗 P。公開中の地域 R は、対象の掲載を持たない / P の PlaceAffiliations に R との所属を加えて保存してコミットし、直後に findRegionFrames を呼ぶ", async () => {
        const { h, w } = await setup();
        const { P } = await placeWithListing(w);
        const R = await w.region();
        expect(await regionFrames(h)).toEqual({ items: [], count: 0 });
        await w.affiliate(P.id, [R.id]);
        expect(idsOf(await regionFrames(h))).toEqual([R.id]);
        const page = await listings(h);
        expect(page.items[0]?.place.regions.map((r) => r.id)).toEqual([R.id]);
      });

      it("feedCandidateQueries#71 参加を持たない開催前の公開中のイベント E / 参加を ParticipationRepository.insert してコミットし、直後に findOccasionFrames を呼ぶ。続けて、参加を delete してコミットし、もう一度呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const P = await w.place();
        const participation = await w.participate(E.id, P.id);
        expect(idsOf(await occasionFrames(h))).toEqual([E.id]);
        await w.dissolveParticipation(participation);
        expect(idsOf(await occasionFrames(h))).toEqual([]);
      });

      it("feedCandidateQueries#72 draft の掲載 L / UnitOfWork の中で、publish した L を save した後に、fn が例外を投げる", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.draft(P.id);
        await expect(
          h.uow.run(async ({ listingRepository }) => {
            const read = await listingRepository.findById(L.id);
            if (read === null) throw new Error("missing");
            await listingRepository.save(
              Listing.publish(read.entity, w.f.tick()).entity,
              read.expectedVersion,
            );
            throw new Error("abort");
          }),
        ).rejects.toThrow("abort");
        expect(await listingIds(h)).toEqual([]);
      });

      it("feedCandidateQueries#73 フィード対象の掲載 L / UnitOfWork の中で、L を delete した後に、fn が例外を投げる", async () => {
        const { h, w } = await setup();
        const { L } = await placeWithListing(w);
        await expect(
          h.uow.run(async ({ listingRepository }) => {
            const read = await listingRepository.findById(L.id);
            if (read === null) throw new Error("missing");
            await listingRepository.delete(L.id, read.expectedVersion);
            throw new Error("abort");
          }),
        ).rejects.toThrow("abort");
        expect(await listingIds(h)).toEqual([L.id]);
      });
    });
  });
}
