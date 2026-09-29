import {
  CategoryId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { OccasionSubject } from "@repo/core/domain/discovery/ports/detailQueries";
import type { Scene } from "@repo/core/domain/discovery/scene";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import { Listing } from "@repo/core/domain/listing/listing";
import { CategoryName } from "@repo/core/domain/listing/values";
import type { Participation } from "@repo/core/domain/occasion/participation";
import { Place } from "@repo/core/domain/place/place";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import {
  type DiscoveryHarnessFactory,
  discoveryWorld,
  listingIdsOf,
  PERIODS,
  TODAY,
} from "./discoveryFixtures";
import { day, period } from "./listingFixtures";
import { PLACE_T0 } from "./placeFixtures";

const PAGE = { page: 1, limit: 10 } as const;
const SCENES: readonly Scene[] = ["reference", "discovery"];
const UNKNOWN_LISTING = ListingId.create(
  "ffffffff-ffff-7fff-8fff-00000fffffff",
);
const UNKNOWN_PLACE = PlaceId.create("ffffffff-ffff-7fff-8fff-00000ffffffe");
const UNKNOWN_REGION = RegionId.create("ffffffff-ffff-7fff-8fff-00000ffffffd");
const UNKNOWN_OCCASION = OccasionId.create(
  "ffffffff-ffff-7fff-8fff-00000ffffffc",
);

const idsOf = (items: readonly Readonly<{ id: string }>[]) =>
  items.map((item) => item.id);

/**
 * `DetailQueries` contract (`spec/testcases/ports/detailQueries.md`).
 * Rows that need articles stay `todo` until stage 5 (Article).
 */
export function describeDetailQueriesContract(
  makeHarness: DiscoveryHarnessFactory,
): void {
  describe("DetailQueries contract", () => {
    const setup = async () => {
      const h = await makeHarness();
      return { h, w: discoveryWorld(h) };
    };

    const listingsOfPlace = (
      h: Awaited<ReturnType<typeof setup>>["h"],
      placeId: PlaceId,
      scene: Scene,
      today: LocalDate = TODAY,
      pagination: Readonly<{ page: number; limit: number }> = PAGE,
    ) =>
      h.detailQueries.findListingsOfPlace(
        { placeId, scene, today },
        pagination,
      );

    const related = (
      h: Awaited<ReturnType<typeof setup>>["h"],
      subject: OccasionSubject,
      today: LocalDate = TODAY,
    ) =>
      h.detailQueries
        .findOccasionsRelatedTo(subject, today)
        .then((found) => idsOf(found));

    describe("対象1件の読み取り", () => {
      it.todo(
        "detailQueries#1 どの集約も保存されていない / findListing・findPlace・findRegion・findOccasion・findArticle を、それぞれ任意の ID で呼ぶ",
      );

      it("findListing, findPlace, findRegion and findOccasion return null when nothing is stored (#1 without findArticle)", async () => {
        const { h } = await setup();
        expect(await h.detailQueries.findListing(UNKNOWN_LISTING)).toBeNull();
        expect(await h.detailQueries.findPlace(UNKNOWN_PLACE)).toBeNull();
        expect(await h.detailQueries.findRegion(UNKNOWN_REGION)).toBeNull();
        expect(await h.detailQueries.findOccasion(UNKNOWN_OCCASION)).toBeNull();
      });

      it("detailQueries#2 営業中の店舗 P の、published で提供中の掲載 L / findListing を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        expect(await h.detailQueries.findListing(L.id)).toEqual({
          listing: L,
          place: w.entryOf(P, [L]),
        });
      });

      it("detailQueries#3 提供開始前の掲載、期日で提供終了の掲載、管理する人が提供終了にした掲載、休業中の店舗の掲載、閉店した店舗の掲載 / それぞれ findListing を呼ぶ", async () => {
        const { h, w } = await setup();
        const open = await w.place();
        const resting = await w.place({ status: "temporarilyClosed" });
        const closed = await w.place({ status: "permanentlyClosed" });
        const ofOpen = [
          await w.upcoming(open.id),
          await w.endedBySchedule(open.id),
          await w.endedByHand(open.id),
        ];
        const ofResting = await w.available(resting.id);
        const ofClosed = await w.available(closed.id);
        const expected = [
          ...ofOpen.map((listing) => ({
            listing,
            place: w.entryOf(open, ofOpen),
          })),
          { listing: ofResting, place: w.entryOf(resting, [ofResting]) },
          { listing: ofClosed, place: w.entryOf(closed, [ofClosed]) },
        ];
        for (const entry of expected) {
          expect(await h.detailQueries.findListing(entry.listing.id)).toEqual(
            entry,
          );
        }
      });

      it("detailQueries#4 draft の掲載、unpublished（byManager）の掲載、unpublished（photoTakedown）の掲載、published で運営による非公開の掲載、非公開の店舗の published の掲載 / それぞれ findListing を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const hidden = await w.place({ suspended: true });
        const listings = [
          await w.draft(P.id),
          await w.unpublished(P.id),
          await w.takenDown(P.id),
          await w.suspendedListing(P.id),
          await w.available(hidden.id),
        ];
        expect(listings[2]?.publication).toMatchObject({
          status: "unpublished",
          reason: "photoTakedown",
        });
        for (const L of listings) {
          expect(await h.detailQueries.findListing(L.id)).toBeNull();
        }
      });

      it("detailQueries#5 published の掲載を ListingRepository.delete で削除した / findListing を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        await w.deleteListing(L);
        expect(await h.detailQueries.findListing(L.id)).toBeNull();
      });

      it("detailQueries#6 content.categoryId が廃止された K のままの掲載 / findListing を呼ぶ", async () => {
        const { h, w } = await setup();
        const K = CategoryId.create(w.f.ids.next());
        const M = CategoryId.create(w.f.ids.next());
        await h.uow.run(async ({ categoryCatalogRepository }) => {
          const read = await categoryCatalogRepository.find();
          const established = CategoryCatalog.establish(
            read.entity,
            [
              { id: K, name: CategoryName.create("食べる") },
              { id: M, name: CategoryName.create("買う") },
            ],
            PLACE_T0,
          ).entity;
          await categoryCatalogRepository.save(
            established,
            read.expectedVersion,
          );
        });
        const P = await w.place();
        const L = await w.store(w.f.published(P.id, { categoryId: K }));
        await h.uow.run(async ({ categoryCatalogRepository }) => {
          const read = await categoryCatalogRepository.find();
          await categoryCatalogRepository.save(
            CategoryCatalog.retire(read.entity, K, M, PLACE_T0).entity,
            read.expectedVersion,
          );
        });
        const found = await h.detailQueries.findListing(L.id);
        expect(found?.listing.content.categoryId).toBe(K);
      });

      it("detailQueries#7 営業中・休業中・閉店の店舗 / それぞれ findPlace を呼ぶ", async () => {
        const { h, w } = await setup();
        for (const status of [
          "open",
          "temporarilyClosed",
          "permanentlyClosed",
        ] as const) {
          const P = await w.place({ status });
          expect(await h.detailQueries.findPlace(P.id)).toEqual(w.entryOf(P));
        }
      });

      it("detailQueries#8 非公開の店舗 / findPlace を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place({ suspended: true });
        expect(await h.detailQueries.findPlace(P.id)).toBeNull();
      });

      it("detailQueries#9 店舗 P が、公開中の地域 X・Y・Z にこの順に所属し、代表地域に Z を選んでいる / findPlace を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const X = await w.region();
        const Y = await w.region();
        const Z = await w.region();
        const affiliations = await w.affiliate(P.id, [X.id, Y.id, Z.id], Z.id);
        const entry = await h.detailQueries.findPlace(P.id);
        expect(entry?.regions).toEqual([Z, X, Y]);
        expect(entry).toEqual(
          w.entryOf(P, [], { affiliations, regions: [X, Y, Z] }),
        );
      });

      it("detailQueries#10 上の Z を unpublish して保存した / findPlace を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const X = await w.region();
        const Y = await w.region();
        const Z = await w.region();
        const affiliations = await w.affiliate(P.id, [X.id, Y.id, Z.id], Z.id);
        const hidden = await w.unpublishRegion(Z);
        const entry = await h.detailQueries.findPlace(P.id);
        expect(entry?.regions).toEqual([X, Y]);
        expect(entry).toEqual(
          w.entryOf(P, [], { affiliations, regions: [X, Y, hidden] }),
        );
      });

      it("a place without affiliations has no regions", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        expect((await h.detailQueries.findPlace(P.id))?.regions).toEqual([]);
      });

      it("detailQueries#11 写真のない店舗 P に、提供終了の掲載だけがある / findPlace を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const e = await w.endedByHand(P.id);
        const entry = await h.detailQueries.findPlace(P.id);
        expect(entry?.substituteCover).toEqual({
          listingId: e.id,
          photo: e.content.photos.items[0],
        });
        expect(entry).toEqual(w.entryOf(P, [e]));
      });

      it("detailQueries#12 写真のない店舗 P に、提供中の掲載 a1（firstPublishedAt が T1）と、提供終了の掲載 e1（T2。T1 < T2）がある / findPlace を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const a1 = await w.available(P.id);
        const e1 = await w.endedBySchedule(P.id);
        const entry = await h.detailQueries.findPlace(P.id);
        expect(entry?.substituteCover).toEqual({
          listingId: e1.id,
          photo: e1.content.photos.items[0],
        });
        expect(entry).toEqual(w.entryOf(P, [a1, e1]));
      });

      it("detailQueries#13 写真のない店舗 P の掲載が、draft と unpublished だけ / findPlace を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        await w.draft(P.id);
        await w.unpublished(P.id);
        expect(
          (await h.detailQueries.findPlace(P.id))?.substituteCover,
        ).toBeNull();
      });

      it("detailQueries#14 写真を持つ店舗 P に、published の掲載がある / findPlace を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place({ photos: 1 });
        const L = await w.available(P.id);
        const entry = await h.detailQueries.findPlace(P.id);
        expect(entry?.substituteCover).toBeNull();
        expect(entry).toEqual(w.entryOf(P, [L]));
      });

      it("detailQueries#15 published の地域 / findRegion を呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        expect(await h.detailQueries.findRegion(R.id)).toEqual(R);
      });

      it("detailQueries#16 draft・unpublished・運営による非公開の地域 / それぞれ findRegion を呼ぶ", async () => {
        const { h, w } = await setup();
        for (const state of ["draft", "unpublished", "suspended"] as const) {
          const R = await w.region({ state });
          expect(await h.detailQueries.findRegion(R.id)).toBeNull();
        }
      });

      it("detailQueries#17 開催前・開催中・終了・中止の公開中のイベント / それぞれ findOccasion を呼ぶ", async () => {
        const { h, w } = await setup();
        const occasions = [
          await w.occasion({ period: PERIODS.upcoming }),
          await w.occasion({ period: PERIODS.ongoing }),
          await w.occasion({ period: PERIODS.ended }),
          await w.occasion({ state: "cancelled" }),
        ];
        for (const E of occasions) {
          expect(await h.detailQueries.findOccasion(E.id)).toEqual(E);
        }
      });

      it("detailQueries#18 draft・unpublished・運営による非公開のイベント / それぞれ findOccasion を呼ぶ", async () => {
        const { h, w } = await setup();
        for (const state of ["draft", "unpublished", "suspended"] as const) {
          const E = await w.occasion({ state });
          expect(await h.detailQueries.findOccasion(E.id)).toBeNull();
        }
      });

      it.todo(
        "detailQueries#19 published の読みもの。紹介先はすべて閲覧できない / findArticle を呼ぶ",
      );
      it.todo(
        "detailQueries#20 draft と unpublished の読みもの / それぞれ findArticle を呼ぶ",
      );
    });

    describe("findListingsOfPlace", () => {
      it('detailQueries#21 店舗 P に掲載がない / scene: "reference" で呼ぶ', async () => {
        const { h, w } = await setup();
        const P = await w.place();
        expect(await listingsOfPlace(h, P.id, "reference")).toEqual({
          items: [],
          count: 0,
        });
      });

      const fourListings = async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const a1 = await w.available(P.id);
        const a2 = await w.available(P.id);
        const u1 = await w.upcoming(P.id);
        const e1 = await w.endedByHand(P.id);
        return { h, w, P, a1, a2, u1, e1 };
      };

      it('detailQueries#22 店舗 P に、提供終了の掲載 e1、提供開始前の掲載 u1、提供中の掲載 a1（firstPublishedAt が T1）・a2（T2）。firstPublishedAt は e1 が最も新しい / scene: "reference" で呼ぶ', async () => {
        const { h, w, P, a1, a2, u1, e1 } = await fourListings();
        const result = await listingsOfPlace(h, P.id, "reference");
        expect(listingIdsOf(result.items)).toEqual([
          a2.id,
          a1.id,
          u1.id,
          e1.id,
        ]);
        expect(result.count).toBe(4);
        const entry = w.entryOf(P, [a1, a2, u1, e1]);
        expect(result.items).toEqual(
          [a2, a1, u1, e1].map((listing) => ({ listing, place: entry })),
        );
      });

      it('detailQueries#23 上と同じ / scene: "discovery" で呼ぶ', async () => {
        const { h, P, a1, a2 } = await fourListings();
        const result = await listingsOfPlace(h, P.id, "discovery");
        expect(listingIdsOf(result.items)).toEqual([a2.id, a1.id]);
        expect(result.count).toBe(2);
      });

      it('detailQueries#24 同じ段階で firstPublishedAt が同じ掲載が2件 / scene: "reference" で呼ぶ', async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const at = w.f.tick();
        const first = await w.available(P.id, at);
        const second = await w.available(P.id, at);
        expect(first.id < second.id).toBe(true);
        const result = await listingsOfPlace(h, P.id, "reference");
        expect(listingIdsOf(result.items)).toEqual([first.id, second.id]);
      });

      it('detailQueries#25 提供期間の開始が 5/10 の掲載 u と、提供中の掲載 a（u より古い） / scene: "reference" で、today を 5/9 にして呼ぶ。別に 5/10 にして呼ぶ', async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const a = await w.available(P.id);
        const u = await w.store(
          w.f.published(P.id, { offering: period("2026-05-10", null) }),
        );
        const on = async (today: string) =>
          listingIdsOf(
            (await listingsOfPlace(h, P.id, "reference", day(today))).items,
          );
        expect(await on("2026-05-09")).toEqual([a.id, u.id]);
        expect(await on("2026-05-10")).toEqual([u.id, a.id]);
      });

      it("detailQueries#26 店舗 P に、draft・unpublished・運営による非公開の掲載がある / どちらの scene でも呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        await w.draft(P.id);
        await w.unpublished(P.id);
        await w.suspendedListing(P.id);
        for (const scene of SCENES) {
          expect(await listingsOfPlace(h, P.id, scene)).toEqual({
            items: [],
            count: 0,
          });
        }
      });

      it('detailQueries#27 閉店した店舗 P に、published で提供中の掲載がある / scene: "reference" と scene: "discovery" で呼ぶ', async () => {
        const { h, w } = await setup();
        const P = await w.place({ status: "permanentlyClosed" });
        const L = await w.available(P.id);
        const reference = await listingsOfPlace(h, P.id, "reference");
        expect(listingIdsOf(reference.items)).toEqual([L.id]);
        expect(reference.count).toBe(1);
        expect(await listingsOfPlace(h, P.id, "discovery")).toEqual({
          items: [],
          count: 0,
        });
      });

      it('detailQueries#28 休業中の店舗 P に、published で提供中の掲載がある / scene: "discovery" で呼ぶ', async () => {
        const { h, w } = await setup();
        const P = await w.place({ status: "temporarilyClosed" });
        const L = await w.available(P.id);
        const result = await listingsOfPlace(h, P.id, "discovery");
        expect(listingIdsOf(result.items)).toEqual([L.id]);
      });

      it("detailQueries#29 店舗 P が非公開。または、その ID の店舗がない / どちらの scene でも呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place({ suspended: true });
        await w.available(P.id);
        for (const scene of SCENES) {
          for (const placeId of [P.id, UNKNOWN_PLACE]) {
            expect(await listingsOfPlace(h, placeId, scene)).toEqual({
              items: [],
              count: 0,
            });
          }
        }
      });

      it("detailQueries#30 別の店舗 Q の掲載がある / P で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const Q = await w.place();
        const mine = await w.available(P.id);
        await w.available(Q.id);
        const result = await listingsOfPlace(h, P.id, "reference");
        expect(listingIdsOf(result.items)).toEqual([mine.id]);
        expect(result.count).toBe(1);
      });

      it("detailQueries#31 P に対象の掲載が3件 / page: 1・limit: 3 で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        for (let i = 0; i < 3; i += 1) await w.available(P.id);
        const result = await listingsOfPlace(h, P.id, "reference", TODAY, {
          page: 1,
          limit: 3,
        });
        expect(result.items).toHaveLength(3);
        expect(result.count).toBe(3);
      });

      it("detailQueries#32 P に対象の掲載が5件 / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const all = [];
        for (let i = 0; i < 5; i += 1) all.push(await w.available(P.id));
        const pages = [];
        for (const page of [1, 2, 3]) {
          pages.push(
            await listingsOfPlace(h, P.id, "reference", TODAY, {
              page,
              limit: 3,
            }),
          );
        }
        expect(pages.map((p) => p.items.length)).toEqual([3, 2, 0]);
        expect(pages.map((p) => p.count)).toEqual([5, 5, 5]);
        expect(pages.flatMap((p) => listingIdsOf(p.items))).toEqual(
          all.map((listing) => listing.id).reverse(),
        );
      });
    });

    describe("findOccasionsRelatedTo", () => {
      it("detailQueries#33 店舗 P が、開催前のイベント E1 に掲載 L を添えて、開催前のイベント E2 に L を添えずに参加中 / listing の L で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        const E1 = await w.occasion();
        const E2 = await w.occasion();
        await w.participate(E1.id, P.id, { listingIds: [L.id] });
        await w.participate(E2.id, P.id);
        expect(await related(h, { kind: "listing", id: L.id })).toEqual([
          E1.id,
        ]);
      });

      it("detailQueries#34 上と同じ / place の P で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        const E1 = await w.occasion();
        const E2 = await w.occasion();
        await w.participate(E1.id, P.id, { listingIds: [L.id] });
        await w.participate(E2.id, P.id);
        expect(await related(h, { kind: "place", id: P.id })).toEqual([
          E1.id,
          E2.id,
        ]);
      });

      it("detailQueries#35 地域 R が、開催前のイベント E1 に linked で、開催前のイベント E2 に detached で関連づけられている / region の R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const E1 = await w.occasion();
        const E2 = await w.occasion();
        await w.link(E1.id, R.id);
        await w.link(E2.id, R.id, { detached: true });
        expect(await related(h, { kind: "region", id: R.id })).toEqual([E1.id]);
      });

      it("detailQueries#36 上の E2 との関連づけを restore して保存した / region の R で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        const E1 = await w.occasion();
        const E2 = await w.occasion();
        await w.link(E1.id, R.id);
        await w.restoreLink(await w.link(E2.id, R.id, { detached: true }));
        expect(await related(h, { kind: "region", id: R.id })).toEqual([
          E1.id,
          E2.id,
        ]);
      });

      it("detailQueries#37 店舗 P が、開催前・開催中・終了・中止のイベントに1つずつ参加中 / place の P で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const upcoming = await w.occasion({ period: PERIODS.upcoming });
        const ongoing = await w.occasion({ period: PERIODS.ongoing });
        const ended = await w.occasion({ period: PERIODS.ended });
        const cancelled = await w.occasion({ state: "cancelled" });
        for (const E of [upcoming, ongoing, ended, cancelled]) {
          await w.participate(E.id, P.id);
        }
        expect(await related(h, { kind: "place", id: P.id })).toEqual([
          ongoing.id,
          upcoming.id,
        ]);
      });

      it("detailQueries#38 店舗 P が参加中のイベントの開催期間の終了が 5/10 / place の P で、today を 5/10 にして呼ぶ。別に 5/11 にして呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const E = await w.occasion({ period: ["2026-05-01", "2026-05-10"] });
        await w.participate(E.id, P.id);
        const subject = { kind: "place", id: P.id } as const;
        expect(await related(h, subject, day("2026-05-10"))).toEqual([E.id]);
        expect(await related(h, subject, day("2026-05-11"))).toEqual([]);
      });

      it("detailQueries#39 店舗 P が参加中の開催前のイベントが、draft・unpublished・運営による非公開のいずれか / place の P で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        for (const state of ["draft", "unpublished", "suspended"] as const) {
          await w.participate((await w.occasion({ state })).id, P.id);
        }
        expect(await related(h, { kind: "place", id: P.id })).toEqual([]);
      });

      it("detailQueries#40 店舗 P が参加中のイベント E1（5/1〜5/5）、E2（4/28〜5/2）、E3（5/1〜5/3） / place の P で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const E1 = await w.occasion({ period: ["2026-05-01", "2026-05-05"] });
        const E2 = await w.occasion({ period: ["2026-04-28", "2026-05-02"] });
        const E3 = await w.occasion({ period: ["2026-05-01", "2026-05-03"] });
        for (const E of [E1, E2, E3]) await w.participate(E.id, P.id);
        expect(
          await related(h, { kind: "place", id: P.id }, day("2026-04-01")),
        ).toEqual([E2.id, E3.id, E1.id]);
      });

      it("detailQueries#41 店舗 P が参加中の、開催期間が同じイベントが2つ / place の P で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const first = await w.occasion();
        const second = await w.occasion();
        await w.participate(second.id, P.id);
        await w.participate(first.id, P.id);
        expect(first.id < second.id).toBe(true);
        expect(await related(h, { kind: "place", id: P.id })).toEqual([
          first.id,
          second.id,
        ]);
      });

      it("detailQueries#42 店舗 P の参加を ParticipationRepository.delete で解除した / place の P で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const E = await w.occasion();
        await w.dissolveParticipation(await w.participate(E.id, P.id));
        expect(await related(h, { kind: "place", id: P.id })).toEqual([]);
      });

      it("detailQueries#43 対象に結びつくイベントがない。または、その ID の対象がない / 3つの種類でそれぞれ呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        const R = await w.region();
        await w.occasion();
        for (const subject of [
          { kind: "listing", id: L.id },
          { kind: "place", id: P.id },
          { kind: "region", id: R.id },
          { kind: "listing", id: UNKNOWN_LISTING },
          { kind: "place", id: UNKNOWN_PLACE },
          { kind: "region", id: UNKNOWN_REGION },
        ] as const) {
          expect(await related(h, subject)).toEqual([]);
        }
      });

      it("detailQueries#44 開催前の公開中のイベントに結びつく、unpublished の掲載（参加に添えられている）、非公開の店舗（参加中）、unpublished の地域（linked） / listing・place・region のそれぞれで呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.unpublished(P.id);
        const hidden = await w.place({ suspended: true });
        const R = await w.region({ state: "unpublished" });
        const E = await w.occasion();
        await w.participate(E.id, P.id, { listingIds: [L.id] });
        await w.participate(E.id, hidden.id);
        await w.link(E.id, R.id);
        expect(await related(h, { kind: "listing", id: L.id })).toEqual([]);
        expect(await related(h, { kind: "place", id: hidden.id })).toEqual([]);
        expect(await related(h, { kind: "region", id: R.id })).toEqual([]);
      });

      it("detailQueries#45 店舗 P が、開催前のイベント12個に参加中 / place の P で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const all = [];
        for (let i = 0; i < 12; i += 1) {
          const E = await w.occasion();
          await w.participate(E.id, P.id);
          all.push(E.id);
        }
        expect(await related(h, { kind: "place", id: P.id })).toEqual(all);
      });
    });

    describe("findParticipants", () => {
      const placeIdsOf = (
        entries: readonly Readonly<{ place: { place: Place } }>[],
      ) => entries.map((entry) => entry.place.place.id);

      it("detailQueries#46 公開中のイベント E に参加がない / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        expect(await h.detailQueries.findParticipants(E.id)).toEqual([]);
      });

      it("detailQueries#47 E に、店舗 P（participatedAt が T1）、Q（T2）、S（T3）が参加中 / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const places = [await w.place(), await w.place(), await w.place()];
        const [P, Q, S] = places;
        const participations: Participation[] = [];
        for (const place of [P, Q, S]) {
          if (place === undefined) throw new Error("three places");
          participations.push(await w.participate(E.id, place.id));
        }
        expect(await h.detailQueries.findParticipants(E.id)).toEqual(
          places.map((place, i) => ({
            place: w.entryOf(place),
            participation: participations[i],
            listings: [],
          })),
        );
      });

      it("detailQueries#48 E に、同じ participatedAt で店舗が2つ参加中 / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const first = await w.place();
        const second = await w.place();
        const at = w.f.tick();
        await w.participate(E.id, second.id, {}, at);
        await w.participate(E.id, first.id, {}, at);
        expect(
          placeIdsOf(await h.detailQueries.findParticipants(E.id)),
        ).toEqual([first.id, second.id]);
      });

      it("detailQueries#49 E に、休業中の店舗、閉店した店舗、非公開の店舗が参加中 / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const resting = await w.place({ status: "temporarilyClosed" });
        const closed = await w.place({ status: "permanentlyClosed" });
        const hidden = await w.place({ suspended: true });
        for (const place of [resting, closed, hidden]) {
          await w.participate(E.id, place.id);
        }
        expect(
          placeIdsOf(await h.detailQueries.findParticipants(E.id)),
        ).toEqual([resting.id, closed.id]);
      });

      it("detailQueries#50 店舗 P の参加の listingIds が l3、l1、l2 の順。どれも published で提供中 / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const P = await w.place();
        const l1 = await w.available(P.id);
        const l2 = await w.available(P.id);
        const l3 = await w.available(P.id);
        await w.participate(E.id, P.id, { listingIds: [l3.id, l1.id, l2.id] });
        const [entry] = await h.detailQueries.findParticipants(E.id);
        expect(entry?.listings).toEqual([l3, l1, l2]);
      });

      it("detailQueries#51 店舗 P の参加に添えた掲載に、提供開始前の掲載と提供終了の掲載がある / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const P = await w.place();
        const upcoming = await w.upcoming(P.id);
        const ended = await w.endedBySchedule(P.id);
        await w.participate(E.id, P.id, {
          listingIds: [upcoming.id, ended.id],
        });
        const [entry] = await h.detailQueries.findParticipants(E.id);
        expect(entry?.listings).toEqual([upcoming, ended]);
      });

      it("detailQueries#52 店舗 P の参加に添えた掲載に、unpublished の掲載、運営による非公開の掲載、delete した掲載がある / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const P = await w.place();
        const kept = await w.available(P.id);
        const unpublished = await w.unpublished(P.id);
        const suspended = await w.suspendedListing(P.id);
        const deleted = await w.available(P.id);
        const listingIds = [unpublished.id, kept.id, suspended.id, deleted.id];
        await w.participate(E.id, P.id, { listingIds });
        await w.deleteListing(deleted);
        const [entry] = await h.detailQueries.findParticipants(E.id);
        expect(entry?.place.place.id).toBe(P.id);
        expect(entry?.listings).toEqual([kept]);
        expect(entry?.participation.details.listingIds).toEqual(listingIds);
      });

      it("detailQueries#53 店舗 P の参加が、掲載を添えていない / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const P = await w.place();
        await w.participate(E.id, P.id);
        const [entry] = await h.detailQueries.findParticipants(E.id);
        expect(entry?.place.place.id).toBe(P.id);
        expect(entry?.listings).toEqual([]);
      });

      it("detailQueries#54 参加日に、開催期間の外になった日付が残っている参加 / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion({ period: PERIODS.upcoming });
        const P = await w.place();
        const dates = [day("2026-07-21"), day("2026-07-25")];
        await w.participate(E.id, P.id, { dates });
        const [entry] = await h.detailQueries.findParticipants(E.id);
        expect(entry?.participation.details.dates).toEqual(dates);
      });

      it("detailQueries#55 終了したイベントと、中止のイベントに参加がある / それぞれで呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        for (const E of [
          await w.occasion({ period: PERIODS.ended }),
          await w.occasion({ state: "cancelled" }),
        ]) {
          await w.participate(E.id, P.id);
          expect(
            placeIdsOf(await h.detailQueries.findParticipants(E.id)),
          ).toEqual([P.id]);
        }
      });

      it("detailQueries#56 イベントが unpublished、または運営による非公開。または、その ID のイベントがない / そのイベントで呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        for (const state of ["unpublished", "suspended"] as const) {
          const E = await w.occasion({ state });
          await w.participate(E.id, P.id);
          expect(await h.detailQueries.findParticipants(E.id)).toEqual([]);
        }
        expect(
          await h.detailQueries.findParticipants(UNKNOWN_OCCASION),
        ).toEqual([]);
      });

      it("detailQueries#57 別のイベント F の参加がある / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const F = await w.occasion();
        const P = await w.place();
        const Q = await w.place();
        await w.participate(E.id, P.id);
        await w.participate(F.id, Q.id);
        expect(
          placeIdsOf(await h.detailQueries.findParticipants(E.id)),
        ).toEqual([P.id]);
      });

      it("detailQueries#58 E に、店舗30個が参加中 / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const all = [];
        for (let i = 0; i < 30; i += 1) {
          const place = await w.place();
          await w.participate(E.id, place.id);
          all.push(place.id);
        }
        expect(
          placeIdsOf(await h.detailQueries.findParticipants(E.id)),
        ).toEqual(all);
      });
    });

    describe("findRegionsOfOccasion", () => {
      const regionsOf = (
        h: Awaited<ReturnType<typeof setup>>["h"],
        occasionId: OccasionId,
      ) =>
        h.detailQueries
          .findRegionsOfOccasion(occasionId)
          .then((found) => idsOf(found));

      it("detailQueries#59 イベント E に関連づけがない / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        expect(await h.detailQueries.findRegionsOfOccasion(E.id)).toEqual([]);
      });

      it("detailQueries#60 E に、地域 X（linkedAt が T1）、Y（T2）が linked で関連づけられている / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const Y = await w.region();
        const X = await w.region();
        await w.link(E.id, X.id);
        await w.link(E.id, Y.id);
        expect(await h.detailQueries.findRegionsOfOccasion(E.id)).toEqual([
          X,
          Y,
        ]);
      });

      it("detailQueries#61 E に、同じ linkedAt で地域が2つ関連づけられている / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const first = await w.region();
        const second = await w.region();
        const at = w.f.tick();
        await w.link(E.id, second.id, { at });
        await w.link(E.id, first.id, { at });
        expect(await regionsOf(h, E.id)).toEqual([first.id, second.id]);
      });

      it("detailQueries#62 E と地域 Z の関連づけが detached / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const X = await w.region();
        const Z = await w.region();
        await w.link(E.id, X.id);
        await w.link(E.id, Z.id, { detached: true });
        expect(await regionsOf(h, E.id)).toEqual([X.id]);
      });

      it("detailQueries#63 上の関連づけを restore して保存した / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const X = await w.region();
        const Z = await w.region();
        const Y = await w.region();
        await w.link(E.id, X.id);
        const detached = await w.link(E.id, Z.id, { detached: true });
        await w.link(E.id, Y.id);
        await w.restoreLink(detached);
        expect(await regionsOf(h, E.id)).toEqual([X.id, Z.id, Y.id]);
      });

      it("detailQueries#64 E に linked で関連づけられた地域が、unpublished、または運営による非公開 / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const X = await w.region();
        const unpublished = await w.region();
        const suspended = await w.region();
        for (const R of [X, unpublished, suspended]) await w.link(E.id, R.id);
        await w.unpublishRegion(unpublished);
        await w.updateRegion(
          suspended,
          (stored) => Region.suspend(stored, w.f.tick()).entity,
        );
        expect(await regionsOf(h, E.id)).toEqual([X.id]);
      });

      it("detailQueries#65 イベント E が unpublished、または運営による非公開。または、その ID のイベントがない。E には公開中の地域が linked で関連づけられている / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        for (const state of ["unpublished", "suspended"] as const) {
          const E = await w.occasion({ state });
          await w.link(E.id, R.id);
          expect(await h.detailQueries.findRegionsOfOccasion(E.id)).toEqual([]);
        }
        expect(
          await h.detailQueries.findRegionsOfOccasion(UNKNOWN_OCCASION),
        ).toEqual([]);
      });

      it("detailQueries#66 E と地域 X の関連づけを RegionLinkRepository.delete で外した / E で呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const X = await w.region();
        await w.unlink(await w.link(E.id, X.id));
        expect(await regionsOf(h, E.id)).toEqual([]);
      });
    });

    describe("findArticlesShowcasing", () => {
      for (const name of [
        "detailQueries#67 店舗 P を紹介先に持つ読みものがない / place の P で呼ぶ",
        "detailQueries#68 P を紹介先に持つ published の読みもの A1・A2・A3 の firstPublishedAt が T1 < T2 < T3 / place の P で呼ぶ",
        "detailQueries#69 firstPublishedAt が同じ読みものが2つ / place の P で呼ぶ",
        "detailQueries#70 P を紹介先に持つ draft の読みものと unpublished の読みもの / place の P で呼ぶ",
        "detailQueries#71 掲載 L、地域 R、イベント E を、それぞれ紹介先に持つ公開中の読みものが1つずつ / listing の L、region の R、occasion の E で、それぞれ呼ぶ",
        "detailQueries#72 店舗 P の掲載 L だけを紹介先に持つ公開中の読みもの / place の P で呼ぶ",
        "detailQueries#73 公開中の読みもの A が、P を含む複数の紹介先を持つ / place の P で呼ぶ",
        "detailQueries#74 非公開の店舗 P、P の published の掲載 L、unpublished の地域 R、運営による非公開のイベント E を、それぞれ紹介先に持つ公開中の読みものがある。または、紹介先の ID の対象がない / それぞれの参照で呼ぶ",
        "detailQueries#75 P を紹介先に持つ公開中の読みものが3つ / page: 1・limit: 3 で呼ぶ",
        "detailQueries#76 P を紹介先に持つ公開中の読みものが5つ / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ",
      ]) {
        it.todo(name);
      }
    });

    describe("可視性と UnitOfWork", () => {
      it("detailQueries#77 published の掲載 L / L を運営による非公開にして save してコミットし、直後に findListing を呼ぶ。続けて、解除して save してコミットし、もう一度呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        await w.updateListing(L, (s) => Listing.suspend(s, w.f.tick()).entity);
        expect(await h.detailQueries.findListing(L.id)).toBeNull();
        await w.updateListing(
          L,
          (s) => Listing.unsuspend(s, w.f.tick()).entity,
        );
        const found = await h.detailQueries.findListing(L.id);
        expect(found?.listing.id).toBe(L.id);
        expect(found?.listing.publication).toEqual(L.publication);
      });

      it("detailQueries#78 published の掲載を持つ店舗 P / P を非公開にして save してコミットし、直後に findPlace・findListing・findListingsOfPlace を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        await w.suspendPlace(P);
        expect(await h.detailQueries.findPlace(P.id)).toBeNull();
        expect(await h.detailQueries.findListing(L.id)).toBeNull();
        expect(await listingsOfPlace(h, P.id, "reference")).toEqual({
          items: [],
          count: 0,
        });
      });

      it("detailQueries#79 営業中の店舗 P / 営業状況を閉店にして save してコミットし、直後に findPlace を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        await w.updatePlace(
          P,
          (s) =>
            Place.changeOperatingStatus(s, "permanentlyClosed", PLACE_T0)
              .entity,
        );
        expect(
          (await h.detailQueries.findPlace(P.id))?.place.operatingStatus,
        ).toBe("permanentlyClosed");
      });

      it("detailQueries#80 公開中のイベント E と、参加していない店舗 P / 参加を insert してコミットし、直後に findParticipants と、place の P の findOccasionsRelatedTo を呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const P = await w.place();
        await w.participate(E.id, P.id);
        const [entry] = await h.detailQueries.findParticipants(E.id);
        expect(entry?.place.place.id).toBe(P.id);
        expect(await related(h, { kind: "place", id: P.id })).toEqual([E.id]);
      });

      it("detailQueries#81 公開中のイベント E と地域 R / 関連づけを insert してコミットし、直後に findRegionsOfOccasion と、region の R の findOccasionsRelatedTo を呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const R = await w.region();
        await w.link(E.id, R.id);
        expect(await h.detailQueries.findRegionsOfOccasion(E.id)).toEqual([R]);
        expect(await related(h, { kind: "region", id: R.id })).toEqual([E.id]);
      });

      it.todo(
        "detailQueries#82 draft の読みもの A が店舗 P を紹介先に持つ（公開条件を満たす） / publish して save してコミットし、直後に findArticle と findArticlesShowcasing を呼ぶ",
      );

      it("detailQueries#83 published の掲載 L / UnitOfWork の中で、unpublish した L を save した後に、fn が例外を投げる", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        await expect(
          h.uow.run(async ({ listingRepository }) => {
            const read = await listingRepository.findById(L.id);
            if (read === null) throw new Error("missing");
            await listingRepository.save(
              Listing.unpublish(read.entity, w.f.tick()).entity,
              read.expectedVersion,
            );
            throw new Error("abort");
          }),
        ).rejects.toThrow("abort");
        expect((await h.detailQueries.findListing(L.id))?.listing).toEqual(L);
      });

      it("detailQueries#84 公開中のイベント E と、参加していない店舗 P / UnitOfWork の中で参加を insert した後に、fn が例外を投げる", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const P = await w.place();
        await expect(
          h.uow.run(async ({ participationRepository }) => {
            await participationRepository.insert(w.o.participation(E.id, P.id));
            throw new Error("abort");
          }),
        ).rejects.toThrow("abort");
        expect(await h.detailQueries.findParticipants(E.id)).toEqual([]);
      });
    });
  });
}
