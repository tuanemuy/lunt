import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import {
  ArticleId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type {
  BookmarkRef,
  ContentRef,
  ShowcaseRef,
} from "@repo/core/domain/common/refs";
import type { ReferenceResolution } from "@repo/core/domain/discovery/entry";
import { Listing } from "@repo/core/domain/listing/listing";
import type { Occasion } from "@repo/core/domain/occasion/occasion";
import type { Place } from "@repo/core/domain/place/place";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import { expectBusinessRuleError } from "./assertions";
import {
  type DiscoveryHarness,
  type DiscoveryHarnessFactory,
  discoveryWorld,
  PERIODS,
} from "./discoveryFixtures";
import { insertListings } from "./listingFixtures";
import { insertPlaces } from "./placeFixtures";

const UNKNOWN = "ffffffff-ffff-7fff-8fff-00000fffffff";

const listingRef = (listing: Pick<Listing, "id">) =>
  ({ kind: "listing", id: listing.id }) as const;
const placeRef = (place: Pick<Place, "id">) =>
  ({ kind: "place", id: place.id }) as const;
const regionRef = (region: Pick<Region, "id">) =>
  ({ kind: "region", id: region.id }) as const;
const occasionRef = (occasion: Pick<Occasion, "id">) =>
  ({ kind: "occasion", id: occasion.id }) as const;

/** `ref` and whether it resolved, for order and viewability checks. */
const shapeOf = (resolutions: readonly ReferenceResolution[]) =>
  resolutions.map((r) => ({ ref: r.ref, viewable: r.viewable }));

/** `ReferenceQueries` contract (`spec/testcases/ports/referenceQueries.md`). */
export function describeReferenceQueriesContract(
  makeHarness: DiscoveryHarnessFactory,
): void {
  describe("ReferenceQueries contract", () => {
    const setup = async () => {
      const h = await makeHarness();
      return { h, w: discoveryWorld(h) };
    };

    const viewable = (h: DiscoveryHarness, ref: ContentRef) =>
      h.referenceQueries.isViewable(ref);

    describe("resolve", () => {
      it("referenceQueries#1 閲覧できる対象がある / 空の refs で resolve を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        await w.available(P.id);
        expect(await h.referenceQueries.resolve([])).toEqual([]);
      });

      it("referenceQueries#2 掲載 L（店舗 P の掲載） / L の参照1件で resolve を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        expect(await h.referenceQueries.resolve([listingRef(L)])).toEqual([
          {
            ref: listingRef(L),
            viewable: true,
            target: {
              kind: "listing",
              entry: { listing: L, place: w.entryOf(P, [L]) },
            },
          },
        ]);
      });

      it("referenceQueries#3 イベント E、掲載 L、地域 R、店舗 P / E、L、R、P の順の参照で resolve を呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion();
        const P = await w.place();
        const L = await w.available(P.id);
        const R = await w.region();
        expect(
          await h.referenceQueries.resolve([
            occasionRef(E),
            listingRef(L),
            regionRef(R),
            placeRef(P),
          ]),
        ).toEqual([
          {
            ref: occasionRef(E),
            viewable: true,
            target: { kind: "occasion", occasion: E },
          },
          {
            ref: listingRef(L),
            viewable: true,
            target: {
              kind: "listing",
              entry: { listing: L, place: w.entryOf(P, [L]) },
            },
          },
          {
            ref: regionRef(R),
            viewable: true,
            target: { kind: "region", region: R },
          },
          {
            ref: placeRef(P),
            viewable: true,
            target: { kind: "place", entry: w.entryOf(P, [L]) },
          },
        ]);
      });

      it("referenceQueries#4 閲覧できる掲載 L1・L3 と、unpublished の掲載 L2 / L1、L2、L3 の順の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L1 = await w.available(P.id);
        const L2 = await w.unpublished(P.id);
        const L3 = await w.available(P.id);
        const result = await h.referenceQueries.resolve([
          listingRef(L1),
          listingRef(L2),
          listingRef(L3),
        ]);
        expect(shapeOf(result)).toEqual([
          { ref: listingRef(L1), viewable: true },
          { ref: listingRef(L2), viewable: false },
          { ref: listingRef(L3), viewable: true },
        ]);
        expect(result[1]).toEqual({ ref: listingRef(L2), viewable: false });
      });

      it("referenceQueries#5 どの集約も指さない ID の参照 / 閲覧できる対象の参照に混ぜて呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        const refs: readonly ShowcaseRef[] = [
          { kind: "listing", id: ListingId.create(UNKNOWN) },
          listingRef(L),
          { kind: "place", id: PlaceId.create(UNKNOWN) },
          placeRef(P),
        ];
        expect(shapeOf(await h.referenceQueries.resolve(refs))).toEqual([
          { ref: refs[0], viewable: false },
          { ref: refs[1], viewable: true },
          { ref: refs[2], viewable: false },
          { ref: refs[3], viewable: true },
        ]);
      });

      it("referenceQueries#6 draft・unpublished・運営による非公開の掲載、非公開の店舗の published の掲載、delete した掲載 / それぞれの参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const hidden = await w.place({ suspended: true });
        const deleted = await w.available(P.id);
        await w.deleteListing(deleted);
        const listings = [
          await w.draft(P.id),
          await w.unpublished(P.id),
          await w.suspendedListing(P.id),
          await w.available(hidden.id),
          deleted,
        ];
        for (const L of listings) {
          expect(await h.referenceQueries.resolve([listingRef(L)])).toEqual([
            { ref: listingRef(L), viewable: false },
          ]);
        }
      });

      it("referenceQueries#7 非公開の店舗 P と、P の published の掲載 L / P と L の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place({ suspended: true });
        const L = await w.available(P.id);
        expect(
          await h.referenceQueries.resolve([placeRef(P), listingRef(L)]),
        ).toEqual([
          { ref: placeRef(P), viewable: false },
          { ref: listingRef(L), viewable: false },
        ]);
      });

      it("referenceQueries#8 draft・unpublished・運営による非公開の地域とイベント / それぞれの参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const refs: ShowcaseRef[] = [];
        for (const state of ["draft", "unpublished", "suspended"] as const) {
          refs.push(regionRef(await w.region({ state })));
          refs.push(occasionRef(await w.occasion({ state })));
        }
        expect(await h.referenceQueries.resolve(refs)).toEqual(
          refs.map((ref) => ({ ref, viewable: false })),
        );
      });

      it("referenceQueries#9 提供開始前の掲載、提供終了の掲載、休業中の店舗、閉店した店舗とその掲載、終了したイベント、中止のイベント / それぞれの参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const ended = await w.occasion({ period: PERIODS.ended });
        const cancelled = await w.occasion({ state: "cancelled" });
        expect(
          await h.referenceQueries.resolve([
            occasionRef(ended),
            occasionRef(cancelled),
          ]),
        ).toEqual([
          {
            ref: occasionRef(ended),
            viewable: true,
            target: { kind: "occasion", occasion: ended },
          },
          {
            ref: occasionRef(cancelled),
            viewable: true,
            target: { kind: "occasion", occasion: cancelled },
          },
        ]);
        const open = await w.place();
        const resting = await w.place({ status: "temporarilyClosed" });
        const closed = await w.place({ status: "permanentlyClosed" });
        const ofOpen = [
          await w.upcoming(open.id),
          await w.endedBySchedule(open.id),
          await w.endedByHand(open.id),
        ];
        const ofClosed = await w.available(closed.id);
        const openEntry = w.entryOf(open, ofOpen);
        const closedEntry = w.entryOf(closed, [ofClosed]);
        const listingResolution = (
          listing: Listing,
          place: typeof openEntry,
        ) => ({
          ref: listingRef(listing),
          viewable: true,
          target: { kind: "listing", entry: { listing, place } },
        });
        expect(
          await h.referenceQueries.resolve([
            ...ofOpen.map(listingRef),
            placeRef(resting),
            placeRef(closed),
            listingRef(ofClosed),
          ]),
        ).toEqual([
          ...ofOpen.map((listing) => listingResolution(listing, openEntry)),
          {
            ref: placeRef(resting),
            viewable: true,
            target: { kind: "place", entry: w.entryOf(resting) },
          },
          {
            ref: placeRef(closed),
            viewable: true,
            target: { kind: "place", entry: closedEntry },
          },
          listingResolution(ofClosed, closedEntry),
        ]);
      });

      it("referenceQueries#10 閲覧できる掲載 L と店舗 P / L、P、L の順の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        const result = await h.referenceQueries.resolve([
          listingRef(L),
          placeRef(P),
          listingRef(L),
        ]);
        expect(shapeOf(result)).toEqual([
          { ref: listingRef(L), viewable: true },
          { ref: placeRef(P), viewable: true },
        ]);
      });

      it("referenceQueries#11 店舗 P の掲載 L。P も閲覧できる / 掲載 L の参照と店舗 P の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        const entry = w.entryOf(P, [L]);
        expect(
          await h.referenceQueries.resolve([listingRef(L), placeRef(P)]),
        ).toEqual([
          {
            ref: listingRef(L),
            viewable: true,
            target: { kind: "listing", entry: { listing: L, place: entry } },
          },
          {
            ref: placeRef(P),
            viewable: true,
            target: { kind: "place", entry },
          },
        ]);
      });

      it("referenceQueries#12 店舗 P が、公開中の地域 X・Y にこの順に所属し、代表地域は Y。unpublished の地域 Z にも所属している / P の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const X = await w.region();
        const Y = await w.region();
        const Z = await w.region({ state: "unpublished" });
        const affiliations = await w.affiliate(P.id, [X.id, Y.id, Z.id], Y.id);
        const [result] = await h.referenceQueries.resolve([placeRef(P)]);
        expect(result).toEqual({
          ref: placeRef(P),
          viewable: true,
          target: {
            kind: "place",
            entry: w.entryOf(P, [], { affiliations, regions: [X, Y, Z] }),
          },
        });
        expect(
          result?.viewable === true && result.target.kind === "place"
            ? result.target.entry.regions
            : null,
        ).toEqual([Y, X]);
      });

      it("referenceQueries#13 写真のない店舗 P に、published の掲載 L1（firstPublishedAt が T1）・L2（T2。T1 < T2）がある / P の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L1 = await w.available(P.id);
        const L2 = await w.available(P.id);
        const [result] = await h.referenceQueries.resolve([placeRef(P)]);
        expect(result).toEqual({
          ref: placeRef(P),
          viewable: true,
          target: { kind: "place", entry: w.entryOf(P, [L1, L2]) },
        });
        expect(
          result?.viewable === true && result.target.kind === "place"
            ? result.target.entry.substituteCover
            : null,
        ).toEqual({ listingId: L2.id, photo: L2.content.photos.items[0] });
      });

      it("referenceQueries#14 参照がすべて、閲覧できない対象を指す / 呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place({ suspended: true });
        const L = await w.available(P.id);
        const refs: readonly ShowcaseRef[] = [
          listingRef(L),
          { kind: "listing", id: ListingId.create(UNKNOWN) },
          placeRef(P),
          { kind: "region", id: RegionId.create(UNKNOWN) },
          { kind: "occasion", id: OccasionId.create(UNKNOWN) },
        ];
        expect(await h.referenceQueries.resolve(refs)).toEqual(
          refs.map((ref) => ({ ref, viewable: false })),
        );
      });

      const hundredAndOne = async (h: DiscoveryHarness) => {
        const w = discoveryWorld(h);
        const places = Array.from({ length: 51 }, () => w.buildPlace());
        await insertPlaces(h, ...places);
        const [first] = places;
        if (first === undefined) throw new Error("places");
        const listings = Array.from({ length: 50 }, () =>
          w.f.published(first.id),
        );
        await insertListings(h, ...listings);
        return [...places.map(placeRef), ...listings.map(listingRef)];
      };

      it("referenceQueries#15 閲覧できる掲載と店舗が、合わせて100件 / 100件の参照で呼ぶ", async () => {
        const h = await makeHarness();
        const refs = (await hundredAndOne(h)).slice(0, 100);
        const result = await h.referenceQueries.resolve(refs);
        expect(result).toHaveLength(100);
        expect(result.map((r) => r.ref)).toEqual(refs);
        expect(result.every((r) => r.viewable)).toBe(true);
      });

      it("referenceQueries#16 閲覧できる掲載と店舗が、合わせて101件 / 101件の参照で呼ぶ", async () => {
        const h = await makeHarness();
        const refs = await hundredAndOne(h);
        expect(refs).toHaveLength(101);
        await expectBusinessRuleError(
          h.referenceQueries.resolve(refs),
          CommonErrorCode.InvalidInput,
        );
      });

      it("referenceQueries#17 掲載と店舗だけの参照（BookmarkRef） / 呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        const bookmarks: readonly BookmarkRef[] = [placeRef(P), listingRef(L)];
        expect(shapeOf(await h.referenceQueries.resolve(bookmarks))).toEqual([
          { ref: placeRef(P), viewable: true },
          { ref: listingRef(L), viewable: true },
        ]);
      });
    });

    describe("isViewable", () => {
      it("referenceQueries#18 営業中・休業中・閉店の店舗 / それぞれ place の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        for (const status of [
          "open",
          "temporarilyClosed",
          "permanentlyClosed",
        ] as const) {
          const P = await w.place({ status });
          expect(await viewable(h, placeRef(P))).toBe(true);
        }
      });

      it("referenceQueries#19 非公開の店舗 / place の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place({ suspended: true });
        expect(await viewable(h, placeRef(P))).toBe(false);
      });

      it("referenceQueries#20 published の掲載で、提供中・提供開始前・提供終了のもの。閉店した店舗の published の掲載 / それぞれ listing の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const closed = await w.place({ status: "permanentlyClosed" });
        for (const L of [
          await w.available(P.id),
          await w.upcoming(P.id),
          await w.endedBySchedule(P.id),
          await w.endedByHand(P.id),
          await w.available(closed.id),
        ]) {
          expect(await viewable(h, listingRef(L))).toBe(true);
        }
      });

      it("referenceQueries#21 draft・unpublished・運営による非公開の掲載 / それぞれ呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        for (const L of [
          await w.draft(P.id),
          await w.unpublished(P.id),
          await w.suspendedListing(P.id),
        ]) {
          expect(await viewable(h, listingRef(L))).toBe(false);
        }
      });

      it("referenceQueries#22 非公開の店舗の published の掲載 / listing の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place({ suspended: true });
        const L = await w.available(P.id);
        expect(await viewable(h, listingRef(L))).toBe(false);
      });

      it("referenceQueries#23 published の地域 / region の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        expect(await viewable(h, regionRef(R))).toBe(true);
      });

      it("referenceQueries#24 draft・unpublished・運営による非公開の地域 / それぞれ呼ぶ", async () => {
        const { h, w } = await setup();
        for (const state of ["draft", "unpublished", "suspended"] as const) {
          expect(await viewable(h, regionRef(await w.region({ state })))).toBe(
            false,
          );
        }
      });

      it("referenceQueries#25 公開中のイベントで、開催前・開催中・終了・中止のもの / それぞれ occasion の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        for (const E of [
          await w.occasion({ period: PERIODS.upcoming }),
          await w.occasion({ period: PERIODS.ongoing }),
          await w.occasion({ period: PERIODS.ended }),
          await w.occasion({ state: "cancelled" }),
        ]) {
          expect(await viewable(h, occasionRef(E))).toBe(true);
        }
      });

      it("referenceQueries#26 draft・unpublished・運営による非公開のイベント / それぞれ呼ぶ", async () => {
        const { h, w } = await setup();
        for (const state of ["draft", "unpublished", "suspended"] as const) {
          expect(
            await viewable(h, occasionRef(await w.occasion({ state }))),
          ).toBe(false);
        }
      });

      it("referenceQueries#27 published の読みもの / article の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const A = await w.article();
        expect(await viewable(h, { kind: "article", id: A.id })).toBe(true);
      });

      it("referenceQueries#28 draft と unpublished の読みもの / それぞれ呼ぶ", async () => {
        const { h, w } = await setup();
        for (const state of ["draft", "unpublished"] as const) {
          const A = await w.article({ state });
          expect(await viewable(h, { kind: "article", id: A.id })).toBe(false);
        }
      });

      it("referenceQueries#29 どの集約も指さない ID / 5つの種類でそれぞれ呼ぶ", async () => {
        const { h } = await setup();
        const refs: readonly ContentRef[] = [
          { kind: "listing", id: ListingId.create(UNKNOWN) },
          { kind: "place", id: PlaceId.create(UNKNOWN) },
          { kind: "region", id: RegionId.create(UNKNOWN) },
          { kind: "occasion", id: OccasionId.create(UNKNOWN) },
          { kind: "article", id: ArticleId.create(UNKNOWN) },
        ];
        for (const ref of refs) expect(await viewable(h, ref)).toBe(false);
      });

      it("referenceQueries#30 delete した掲載 / listing の参照で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        await w.deleteListing(L);
        expect(await viewable(h, listingRef(L))).toBe(false);
      });

      it("referenceQueries#31 店舗 P がある。P の ID と同じ文字列を ID に持つ掲載はない / P の ID を listing の参照の ID にして呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        expect(
          await viewable(h, { kind: "listing", id: ListingId.create(P.id) }),
        ).toBe(false);
        expect(await viewable(h, placeRef(P))).toBe(true);
      });
    });

    describe("可視性と UnitOfWork", () => {
      const suspendedPlaceWithListing = async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        await w.suspendPlace(P);
        return { h, w, P, L };
      };

      it("referenceQueries#32 published の掲載 L を持つ店舗 P / P を非公開にして save してコミットし、直後に P と L の isViewable と resolve を呼ぶ", async () => {
        const { h, P, L } = await suspendedPlaceWithListing();
        expect(await viewable(h, placeRef(P))).toBe(false);
        expect(await viewable(h, listingRef(L))).toBe(false);
        expect(
          await h.referenceQueries.resolve([placeRef(P), listingRef(L)]),
        ).toEqual([
          { ref: placeRef(P), viewable: false },
          { ref: listingRef(L), viewable: false },
        ]);
      });

      it("referenceQueries#33 上の続き / P の非公開を解除して save してコミットし、直後に同じ読み取りを呼ぶ", async () => {
        const { h, w, P, L } = await suspendedPlaceWithListing();
        await w.unsuspendPlace(P);
        expect(await viewable(h, placeRef(P))).toBe(true);
        expect(await viewable(h, listingRef(L))).toBe(true);
        expect(
          shapeOf(
            await h.referenceQueries.resolve([placeRef(P), listingRef(L)]),
          ),
        ).toEqual([
          { ref: placeRef(P), viewable: true },
          { ref: listingRef(L), viewable: true },
        ]);
      });

      it("referenceQueries#34 unpublished の掲載 L / publish して save してコミットし、直後に isViewable を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.unpublished(P.id);
        await w.updateListing(L, (s) => Listing.publish(s, w.f.tick()).entity);
        expect(await viewable(h, listingRef(L))).toBe(true);
      });

      it("referenceQueries#35 published の地域 R / unpublish した R を save してコミットし、直後に isViewable と resolve を呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region();
        expect(await viewable(h, regionRef(R))).toBe(true);
        await w.updateRegion(
          R,
          (stored) => Region.unpublish(stored, w.f.tick()).entity,
        );
        expect(await viewable(h, regionRef(R))).toBe(false);
        expect(await h.referenceQueries.resolve([regionRef(R)])).toEqual([
          { ref: regionRef(R), viewable: false },
        ]);
      });

      it("referenceQueries#36 保存されていない店舗 P / UnitOfWork の中で P を insert してコミットし、直後に isViewable を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = w.buildPlace();
        expect(await viewable(h, placeRef(P))).toBe(false);
        await insertPlaces(h, P);
        expect(await viewable(h, placeRef(P))).toBe(true);
      });

      it("referenceQueries#37 published の掲載 L / UnitOfWork の中で、L を運営による非公開にして save した後に、fn が例外を投げる", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.available(P.id);
        await expect(
          h.uow.run(async ({ listingRepository }) => {
            const read = await listingRepository.findById(L.id);
            if (read === null) throw new Error("missing");
            await listingRepository.save(
              Listing.suspend(read.entity, w.f.tick()).entity,
              read.expectedVersion,
            );
            throw new Error("abort");
          }),
        ).rejects.toThrow("abort");
        expect(await viewable(h, listingRef(L))).toBe(true);
        expect(
          shapeOf(await h.referenceQueries.resolve([listingRef(L)])),
        ).toEqual([{ ref: listingRef(L), viewable: true }]);
      });
    });
  });
}
